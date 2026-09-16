// ─── Types ──────────────────────────────────────────────────────────────────

import { emitRuntimeEvent } from './diagnostics.js'
export { observeRuntime, emitRuntimeEvent } from './diagnostics.js'
export type { RuntimeEvent, RuntimeEventKind } from './diagnostics.js'

interface Subscriber {
  _fn: () => (() => void) | void
  _dependencies: Set<Set<Subscriber>>
  _cleanup: (() => void) | null
  _disposed: boolean
  _derived: boolean
  _seq: number
}

// ─── Observer Stack ──────────────────────────────────────────────────────────

const observerStack: Subscriber[] = []

function getCurrentObserver(): Subscriber | null {
  return observerStack[observerStack.length - 1] ?? null
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let batchDepth = 0
let isFlushing = false
let nextSubscriberSeq = 0
const pendingEffects = new Set<Subscriber>()
const pendingDerived = new Set<Subscriber>()

function scheduleEffect(sub: Subscriber): void {
  if (!sub._disposed) (sub._derived ? pendingDerived : pendingEffects).add(sub)
}

function takeQueued(queue: Set<Subscriber>, byCreation: boolean): Subscriber {
  let chosen = queue.values().next().value!
  if (byCreation && queue.size > 1) {
    for (const sub of queue) {
      if (sub._seq < chosen._seq) chosen = sub
    }
  }
  queue.delete(chosen)
  return chosen
}

function flushIfNeeded(): void {
  if (batchDepth === 0 && !isFlushing) {
    flush()
  }
}

function flush(): void {
  if (isFlushing) return
  isFlushing = true
  const failures: unknown[] = []
  try {
    // Settle derived values before exposing them to effects. Pending deriveds
    // run in creation order so a newly queued chain precedes later siblings.
    // Re-check after each subscriber: an effect may write and enqueue more work.
    while (pendingDerived.size > 0 || pendingEffects.size > 0) {
      const derived = pendingDerived.size > 0
      const queue = derived ? pendingDerived : pendingEffects
      const sub = takeQueued(queue, derived)
      try { runSubscriber(sub) } catch (error) { failures.push(error) }
    }
  } finally {
    isFlushing = false
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Reactive updates failed')
}

// ─── Core: run a subscriber ──────────────────────────────────────────────────

function runSubscriber(sub: Subscriber): void {
  if (sub._disposed) return
  // Clear previous subscriptions — handles conditional deps correctly
  sub._dependencies.forEach(depSet => { depSet.delete(sub); emitRuntimeEvent('subscription-remove', sub, depSet) })
  sub._dependencies.clear()

  // Run previous cleanup before re-running
  const cleanup = sub._cleanup
  sub._cleanup = null
  cleanup?.()

  observerStack.push(sub)
  try {
    emitRuntimeEvent('computation-run', sub)
    const result = sub._fn()
    if (typeof result === 'function') {
      sub._cleanup = result
    }
  } finally {
    observerStack.pop()
  }
}

function disposeSubscriber(sub: Subscriber): void {
  if (sub._disposed) return
  sub._disposed = true
  pendingEffects.delete(sub)
  pendingDerived.delete(sub)
  sub._dependencies.forEach(depSet => { depSet.delete(sub); emitRuntimeEvent('subscription-remove', sub, depSet) })
  sub._dependencies.clear()
  const cleanup = sub._cleanup
  sub._cleanup = null
  try { cleanup?.() } finally { emitRuntimeEvent('computation-dispose', sub) }
}

// ─── createSignal ────────────────────────────────────────────────────────────

export function createSignal<T>(
  initial: T
): [() => T, (value: T | ((prev: T) => T)) => void] {
  let value = initial
  const subscribers = new Set<Subscriber>()

  const getter = (): T => {
    const observer = getCurrentObserver()
    if (observer) {
      if (!subscribers.has(observer)) emitRuntimeEvent('subscription-add', observer, subscribers)
      subscribers.add(observer)
      observer._dependencies.add(subscribers)
    }
    return value
  }

  const setter = (newValueOrUpdater: T | ((prev: T) => T)): void => {
    const newValue =
      typeof newValueOrUpdater === 'function'
        ? (newValueOrUpdater as (prev: T) => T)(value)
        : newValueOrUpdater

    if (Object.is(newValue, value)) return
    value = newValue

    // CRITICAL FIX: schedule ALL subscribers first, then flush ONCE.
    // Previously each scheduleEffect call could trigger its own flush,
    // causing the diamond to propagate in multiple cycles instead of one.
    subscribers.forEach(sub => scheduleEffect(sub))
    flushIfNeeded()
  }

  return [getter, setter]
}

// ─── effect ──────────────────────────────────────────────────────────────────

export function effect(fn: () => (() => void) | void): () => void {
  return createEffect(fn, false)
}

function createEffect(fn: () => (() => void) | void, derived: boolean): () => void {
  const sub: Subscriber = {
    _fn: fn,
    _dependencies: new Set(),
    _cleanup: null,
    _disposed: false,
    _derived: derived,
    _seq: nextSubscriberSeq++,
  }

  emitRuntimeEvent('computation-create', sub)
  try {
    runSubscriber(sub)
  } catch (error) {
    // No disposer reaches the caller when setup fails.
    disposeSubscriber(sub)
    throw error
  }

  return () => disposeSubscriber(sub)
}

// ─── computed ────────────────────────────────────────────────────────────────

export function computed<T>(fn: () => T): (() => T) & { dispose: () => void } {
  type Outcome = { ok: true; value: T } | { ok: false; error: unknown }
  const [read, write] = createSignal<Outcome>({ ok: true, value: undefined as T })

  const dispose = createEffect(() => {
    let outcome: Outcome
    try { outcome = { ok: true, value: fn() } }
    catch (error) { outcome = { ok: false, error } }
    // Cache failure as well as success: a downstream read must never receive
    // the previous successful value as if this evaluation had succeeded.
    write(previous => previous.ok && outcome.ok && Object.is(previous.value, outcome.value)
      ? previous : outcome)
    if (!outcome.ok) throw outcome.error
  }, true)

  const getter = (): T => {
    const outcome = read()
    if (!outcome.ok) throw outcome.error
    return outcome.value
  }
  return Object.assign(getter, { dispose })
}

// ─── untrack ─────────────────────────────────────────────────────────────────
// Runs fn with no observer current, so signal reads inside it do not subscribe
// the surrounding effect. Nested effects created inside fn still track their own
// reads normally, because they push themselves onto the (now empty) stack — that
// is why this saves and restores the stack rather than setting a "disabled" flag.
//
// The renderer needs this to build list rows: creating a row reads the row's
// data, and without untrack those reads would subscribe the *list* effect to
// every row, so touching one row would re-reconcile the whole list.

export function untrack<T>(fn: () => T): T {
  const saved = observerStack.splice(0, observerStack.length)
  try {
    return fn()
  } finally {
    for (let i = 0; i < saved.length; i++) observerStack.push(saved[i])
  }
}

// ─── batch ───────────────────────────────────────────────────────────────────

export function batch(fn: () => void): void {
  batchDepth++
  const failures: unknown[] = []
  try { fn() } catch (error) { failures.push(error) }
  finally { batchDepth-- }
  try { flushIfNeeded() } catch (error) { failures.push(error) }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Batch callback and reactive updates failed')
}

