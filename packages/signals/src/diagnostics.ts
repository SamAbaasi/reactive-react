export type RuntimeEventKind =
  | 'component-create' | 'component-enter' | 'component-leave' | 'component-dispose'
  | 'computation-create' | 'computation-run' | 'computation-dispose'
  | 'subscription-add' | 'subscription-remove' | 'reconciler-enter' | 'list-operation'

export interface RuntimeEvent {
  kind: RuntimeEventKind
  subject: object
  dependency?: object
}

const observers = new Set<(event: RuntimeEvent) => void>()

/** Optional synchronous diagnostics. Observers must not mutate runtime state. */
export function observeRuntime(observer: (event: RuntimeEvent) => void): () => void {
  observers.add(observer)
  return () => { observers.delete(observer) }
}

/** Internal instrumentation shared by the signal runtime, hooks and renderer. */
export function emitRuntimeEvent(kind: RuntimeEventKind, subject: object, dependency?: object): void {
  if (!observers.size) return
  const event = { kind, subject, dependency }
  for (const observer of observers) observer(event)
}
