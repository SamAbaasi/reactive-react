import { describe, it, expect, vi } from 'vitest'
import { h, mount, unmountNode } from '../src/index'
import { useEffect, useState, useLayoutEffect } from '@rrjs/react-compat'

function nextMacroTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('unmount', () => {
  it('mount() returns an unmount function that removes the root from the DOM', () => {
    function App() {
      return h('div', { id: 'mounted' }, 'hello')
    }

    const container = document.createElement('div')
    const dispose = mount(App, container)

    expect(container.querySelector('#mounted')).toBeDefined()

    dispose()

    expect(container.querySelector('#mounted')).toBeNull()
  })

  it('runs useEffect cleanup when the component is unmounted', async () => {
    const cleanup = vi.fn()

    function App() {
      useEffect(() => {
        return cleanup
      }, [])
      return h('div', null, 'mounted')
    }

    const container = document.createElement('div')
    const dispose = mount(App, container)

    await nextMacroTask()

    expect(cleanup).not.toHaveBeenCalled()

    dispose()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

it('runs useLayoutEffect cleanup on unmount', () => {
    const layoutCleanup = vi.fn()

    function App() {
      useLayoutEffect(() => layoutCleanup, [])
      return h('div', null)
    }

    const container = document.createElement('div')
    const dispose = mount(App, container)

    // useLayoutEffect runs synchronously during mount — no await needed
    dispose()
    expect(layoutCleanup).toHaveBeenCalledTimes(1)
  })

  it('no memory leak — 100 mount/unmount cycles leave no orphaned subscriptions', async () => {
    const cleanups: ReturnType<typeof vi.fn>[] = []

    function App() {
      const cleanup = vi.fn()
      cleanups.push(cleanup)
      useEffect(() => cleanup, [])
      return h('div', null, 'cycle')
    }

    const container = document.createElement('div')

    for (let i = 0; i < 100; i++) {
      const dispose = mount(App, container)
      await nextMacroTask()
      dispose()
    }

    // Every cleanup must have fired exactly once
    expect(cleanups).toHaveLength(100)
    for (const c of cleanups) {
      expect(c).toHaveBeenCalledTimes(1)
    }
  })

it('unmountNode runs cleanups recursively for nested components', async () => {
    const innerCleanup = vi.fn()
    const outerCleanup = vi.fn()

    function Inner() {
      useEffect(() => innerCleanup, [])
      return h('span', null, 'inner')
    }

    function Outer() {
      useEffect(() => outerCleanup, [])
      return h('div', null, h(Inner, null))
    }

    const container = document.createElement('div')
    const dispose = mount(Outer, container)

    await nextMacroTask()   // let useEffect fire so cleanup gets stored on hook

    dispose()

    expect(innerCleanup).toHaveBeenCalledTimes(1)
    expect(outerCleanup).toHaveBeenCalledTimes(1)
  })

it('a second unmount call is safe — cleanups do not fire twice', async () => {
    const cleanup = vi.fn()

    function App() {
      useEffect(() => cleanup, [])
      return h('div', null)
    }

    const container = document.createElement('div')
    const dispose = mount(App, container)

    await nextMacroTask()

    dispose()
    dispose()
    dispose()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})