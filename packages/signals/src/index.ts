// ─── Types ──────────────────────────────────────────────────────────────────

interface Subscriber {
  _fn: () => (() => void) | void
  _dependencies: Set<Set<Subscriber>>
  _cleanup: (() => void) | null
}

// ─── Observer Stack ──────────────────────────────────────────────────────────

const observerStack: Subscriber[] = []

function getCurrentObserver(): Subscriber | null {
  return observerStack[observerStack.length - 1] ?? null
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let batchDepth = 0
let isFlushing = false
const pendingEffects = new Set<Subscriber>()

function scheduleEffect(sub: Subscriber): void {
  pendingEffects.add(sub)
}

function flushIfNeeded(): void {
  if (batchDepth === 0 && !isFlushing) {
    flush()
  }
}

function flush(): void {
  if (isFlushing) return
  isFlushing = true
  try {
    // Wave-based: each wave runs to completion before the next wave starts.
    // Effects scheduled DURING a wave go to the NEXT wave.
    // This is what handles diamond dependencies correctly:
    // effect_b and effect_c both run in wave 1,
    // effect_d runs once in wave 2,
    // effect_spy runs once in wave 3.
    while (pendingEffects.size > 0) {
      const toRun = [...pendingEffects]
      pendingEffects.clear()
      for (const sub of toRun) {
        runSubscriber(sub)
      }
    }
  } finally {
    isFlushing = false
  }
}

// ─── Core: run a subscriber ──────────────────────────────────────────────────

function runSubscriber(sub: Subscriber): void {
  // Clear previous subscriptions — handles conditional deps correctly
  sub._dependencies.forEach(depSet => depSet.delete(sub))
  sub._dependencies.clear()

  // Run previous cleanup before re-running
  sub._cleanup?.()
  sub._cleanup = null

  observerStack.push(sub)
  try {
    const result = sub._fn()
    if (typeof result === 'function') {
      sub._cleanup = result
    }
  } finally {
    observerStack.pop()
  }
}

function disposeSubscriber(sub: Subscriber): void {
  sub._dependencies.forEach(depSet => depSet.delete(sub))
  sub._dependencies.clear()
  sub._cleanup?.()
  sub._cleanup = null
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
  const sub: Subscriber = {
    _fn: fn,
    _dependencies: new Set(),
    _cleanup: null,
  }

  runSubscriber(sub)

  return () => disposeSubscriber(sub)
}

// ─── computed ────────────────────────────────────────────────────────────────

export function computed<T>(fn: () => T): () => T {
  const [getter, setter] = createSignal<T>(undefined as T)

  effect(() => {
    setter(fn())
  })

  return getter
}

// ─── batch ───────────────────────────────────────────────────────────────────

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    flushIfNeeded()
  }
}

