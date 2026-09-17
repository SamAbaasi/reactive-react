// ─── Types ──────────────────────────────────────────────────────────────────

import { emitRuntimeEvent } from '@rrjs/signals'

export interface ComponentInstance {
  /** Diagnostic identity of the mounted component; never used for behavior. */
  displayName?: string
  // Hook storage — one slot per hook call in this component
  hooks: any[]
  // Resets to 0 before every fn() call, increments per hook
  hookIndex: number
  // Effect queues — separate because timing differs
  layoutEffects: EffectEntry[]
  passiveEffects: EffectEntry[]
  // Cleanup on unmount
  cleanup: Array<() => void>
}

export interface EffectEntry {
  run: () => void
  cleanup: (() => void) | null
}

// ─── The current rendering instance ─────────────────────────────────────────
// While a component function is running, this holds the instance whose hooks
// should be allocated to the next hook call. After the function returns,
// it goes back to null.

let currentInstance: ComponentInstance | null = null

export function getCurrentInstance(): ComponentInstance {
  if (!currentInstance) {
    throw new Error(
      'Hook called outside of a component. ' +
      'Hooks can only be called inside the body of a component function.'
    )
  }
  return currentInstance
}

export function setCurrentInstance(instance: ComponentInstance | null): void {
  currentInstance = instance
}

// ─── Create a new component instance ────────────────────────────────────────

export function createInstance(displayName?: string): ComponentInstance {
  const instance: ComponentInstance = {
    displayName,
    hooks: [],
    hookIndex: 0,
    layoutEffects: [],
    passiveEffects: [],
    cleanup: [],
  }
  emitRuntimeEvent('component-create', instance)
  return instance
}

// ─── Render lifecycle ───────────────────────────────────────────────────────
// Wraps a component function call with the proper instance setup.
// hookIndex resets to 0 — this is critical.
// If anything triggers a re-run (rare in our signal model but possible),
// hooks must be allocated from the same array slots, in the same order.

export function withInstance<T>(
  instance: ComponentInstance,
  fn: () => T
): T {
  const prev = currentInstance
  setCurrentInstance(instance)
  instance.hookIndex = 0
  try {
    emitRuntimeEvent('component-enter', instance)
    return fn()
  } finally {
    setCurrentInstance(prev)
    emitRuntimeEvent('component-leave', instance)
  }
}


// ─── Effect flushing ────────────────────────────────────────────────────────
// Called by the renderer after a component has finished its render phase
// and DOM mutations are committed. This is the "commit phase" equivalent.
//
// Layout effects run synchronously, before paint.
// Passive effects are scheduled via MessageChannel — they run in a new macro
// task after the browser has had the chance to paint.

// MessageChannel is the same mechanism React's Scheduler uses for the same reason:
// queueMicrotask runs BEFORE paint (microtask checkpoint), which is wrong for useEffect.
// MessageChannel posts a message that delivers in the NEXT macro task, after paint.
const channel = new MessageChannel()
const pendingPassiveFlushes: Array<() => void> = []

// In Node a MessagePort with a listener keeps the event loop alive, so importing
// this module used to stop a Node process from ever exiting on its own. Hold the
// port only while a flush is waiting: a scheduled effect is still delivered
// before the process ends, and an idle module keeps nothing open. Browsers have
// no ref/unref, so this changes nothing there, and delivery still goes through
// the same channel, so effect timing is unchanged.
type Referable = { ref?: () => void; unref?: () => void }
const receiver = channel.port1 as MessagePort & Referable

receiver.onmessage = () => {
  const flushes = pendingPassiveFlushes.splice(0)
  try {
    for (const flush of flushes) flush()
  } finally {
    if (pendingPassiveFlushes.length === 0) receiver.unref?.()
  }
}
receiver.unref?.()

export function flushLayoutEffects(instance: ComponentInstance): void {
  // Run synchronously. Cleanup of previous effect, then run new effect.
  // Order matters: all cleanups for stale effects fire before any new effect runs.
  // We separate into two passes to match React's behavior.
  const entries = instance.layoutEffects
  instance.layoutEffects = []

  for (const entry of entries) {
    entry.cleanup?.()
  }
  for (const entry of entries) {
    entry.run()
  }
}

export function flushPassiveEffects(instance: ComponentInstance): void {
  // Schedule, don't run. Effects run in the next macro task — after paint.
  pendingPassiveFlushes.push(() => {
    const entries = instance.passiveEffects
    instance.passiveEffects = []

    for (const entry of entries) {
      entry.cleanup?.()
    }
    for (const entry of entries) {
      entry.run()
    }
  })

  receiver.ref?.()
  channel.port2.postMessage(null)
}
