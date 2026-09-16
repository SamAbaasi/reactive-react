import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { observeRuntime } from '../../packages/signals/dist/index.js'

export const hash = source => createHash('sha256').update(source).digest('hex')
export function assertSameSource(reference, target) {
  assert.equal(hash(target), hash(reference), 'P4: component source changed between targets')
}
export function assertSourceManifests(reference, target, required) {
  assert.deepEqual(Object.keys(reference).sort(), [...required].sort(), 'P4: reference source manifest is incomplete or contains unexpected files')
  assert.deepEqual(Object.keys(target).sort(), [...required].sort(), 'P4: target source manifest is incomplete or contains unexpected files')
  for (const name of required) assert.equal(target[name], reference[name], `P4: component source changed between targets: ${name}`)
}
export function assertNamespaceMap(actual, expected) {
  assert.deepEqual(actual, expected, 'P5: DOM namespace map diverged')
}
export function assertPortalPlacement(source, target, selector) {
  assert.equal(source.querySelector(selector), null, 'P5: portal content rendered in the source container')
  assert.ok(target.querySelector(selector), 'P5: portal content missing from its target container')
}
export function assertPortalDisposed(target, selector) {
  assert.equal(target.querySelector(selector), null, 'P5: portal content leaked after owner unmount')
}
export function assertNoReactRuntime(modules) {
  for (const module of modules) {
    assert.ok(!/(?:^|\/)node_modules\/(react|react-dom|scheduler)(?:\/|$)/.test(module.replace(/\\/g, '/')), `P3: React runtime module ${module}`)
  }
}
export function captureRuntime() {
  const identities = new WeakMap()
  let nextId = 1
  const id = object => {
    if (!object) return undefined
    if (!identities.has(object)) identities.set(object, nextId++)
    return identities.get(object)
  }
  const events = []
  const stop = observeRuntime(event => events.push({ kind: event.kind, id: id(event.subject), dependency: id(event.dependency) }))
  return { events, stop }
}
export function assertArchitecture(events, { instances = 1, unmounted = true, bodyExecutions } = {}) {
  assert.equal(events.filter(event => event.kind === 'reconciler-enter').length, 0, 'P2: actual reconciler entry invoked')
  const created = events.filter(event => event.kind === 'component-create')
  assert.equal(created.length, instances, 'P1: unexpected component mounts (possible remount fallback)')
  for (const { id } of created) {
    assert.equal(events.filter(event => event.kind === 'component-enter' && event.id === id).length, 1, 'P1: component re-executed')
    assert.equal(events.filter(event => event.kind === 'component-leave' && event.id === id).length, 1, 'P1: unbalanced component execution')
    if (unmounted) assert.equal(events.filter(event => event.kind === 'component-dispose' && event.id === id).length, 1, 'P5: component not disposed exactly once')
  }
  if (bodyExecutions !== undefined) assert.equal(bodyExecutions, instances, 'P1: original component body replayed outside its instance')
  if (unmounted) {
    const liveComputations = new Set()
    const subscriptions = new Set()
    for (const event of events) {
      if (event.kind === 'computation-create') liveComputations.add(event.id)
      if (event.kind === 'computation-dispose') liveComputations.delete(event.id)
      if (event.kind === 'subscription-add') subscriptions.add(`${event.id}:${event.dependency}`)
      if (event.kind === 'subscription-remove') subscriptions.delete(`${event.id}:${event.dependency}`)
    }
    assert.equal(liveComputations.size, 0, 'P5: computation leaked after unmount')
    assert.equal(subscriptions.size, 0, 'P5: subscription leaked after unmount')
  }
}
export function assertNoReactiveWork(events, start) {
  assert.equal(events.slice(start).filter(event => event.kind === 'computation-run').length, 0, 'P5: reactive work after unmount')
}
