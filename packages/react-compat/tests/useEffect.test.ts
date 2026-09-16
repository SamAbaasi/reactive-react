import { describe, it, expect, vi } from 'vitest'
import { createInstance, withInstance, flushPassiveEffects, flushLayoutEffects } from '../src/instance'
import { useEffect } from '../src/hooks/useEffect'
import { useLayoutEffect } from '../src/hooks/useLayoutEffect'

// Helper to wait for the MessageChannel macro task to deliver
function nextMacroTask(): Promise<void> {
  // Passive effects are queued on a MessageChannel (see react-compat/src/instance.ts).
  // A bare setTimeout(0) is a *different* macrotask source, and neither jsdom nor the
  // HTML spec orders port-message delivery against timer callbacks. Racing them made
  // these tests fail ~35% of the time in a full-repo run. Posting on a channel of our
  // own is delivered FIFO *after* the library's already-posted message, so this waits
  // for the flush instead of gambling on it. The trailing timer also drains any
  // timer-based work scheduled by the effect itself.
  return new Promise(resolve => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => setTimeout(resolve, 0)
    ch.port2.postMessage(null)
  })
}

describe('useEffect', () => {
  it('does NOT run during the render phase', () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useEffect(() => { spy() })
    })

    // Effect is queued, not run
    expect(spy).not.toHaveBeenCalled()
  })

  it('runs after passive flush', async () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useEffect(() => { spy() })
    })

    flushPassiveEffects(instance)
    await nextMacroTask()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('re-runs when deps change', async () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useEffect(() => { spy('a') }, [1])
    })
    flushPassiveEffects(instance)
    await nextMacroTask()

    // Re-render with changed deps
    withInstance(instance, () => {
      useEffect(() => { spy('b') }, [2])
    })
    flushPassiveEffects(instance)
    await nextMacroTask()

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, 'a')
    expect(spy).toHaveBeenNthCalledWith(2, 'b')
  })

  it('does NOT re-run when deps are unchanged', async () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useEffect(() => { spy() }, [1])
    })
    flushPassiveEffects(instance)
    await nextMacroTask()

    withInstance(instance, () => {
      useEffect(() => { spy() }, [1])
    })
    flushPassiveEffects(instance)
    await nextMacroTask()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('runs on every render with no deps array', async () => {
    const instance = createInstance()
    const spy = vi.fn()

    for (let i = 0; i < 3; i++) {
      withInstance(instance, () => {
        useEffect(() => { spy() })
      })
      flushPassiveEffects(instance)
      await nextMacroTask()
    }

    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('empty deps — runs once on mount, never again', async () => {
    const instance = createInstance()
    const spy = vi.fn()

    for (let i = 0; i < 3; i++) {
      withInstance(instance, () => {
        useEffect(() => { spy() }, [])
      })
      flushPassiveEffects(instance)
      await nextMacroTask()
    }

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('runs cleanup before next effect', async () => {
    const instance = createInstance()
    const log: string[] = []

    withInstance(instance, () => {
      useEffect(() => {
        log.push('run-1')
        return () => log.push('cleanup-1')
      }, [1])
    })
    flushPassiveEffects(instance)
    await nextMacroTask()

    withInstance(instance, () => {
      useEffect(() => {
        log.push('run-2')
        return () => log.push('cleanup-2')
      }, [2])
    })
    flushPassiveEffects(instance)
    await nextMacroTask()

    expect(log).toEqual(['run-1', 'cleanup-1', 'run-2'])
  })

  it('uses MessageChannel timing — fires in a new macro task, not microtask', async () => {
    const instance = createInstance()
    const order: string[] = []

    withInstance(instance, () => {
      useEffect(() => {
        order.push('useEffect')
      })
    })

    flushPassiveEffects(instance)
    // Microtask runs first
    queueMicrotask(() => order.push('microtask'))
    await nextMacroTask()

    // The microtask runs BEFORE useEffect — proving useEffect is NOT a microtask.
    // It's deferred to the next macro task via MessageChannel.
    expect(order).toEqual(['microtask', 'useEffect'])
  })
})

describe('useLayoutEffect', () => {
  it('runs synchronously on flushLayoutEffects', () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useLayoutEffect(() => { spy() })
    })

    expect(spy).not.toHaveBeenCalled()

    flushLayoutEffects(instance)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('runs BEFORE useEffect', async () => {
    const instance = createInstance()
    const order: string[] = []

    withInstance(instance, () => {
      useLayoutEffect(() => { order.push('layout') })
      useEffect(() => { order.push('passive') })
    })

    flushLayoutEffects(instance)
    flushPassiveEffects(instance)
    await nextMacroTask()

    // Layout effect runs synchronously, passive in next macro task.
    // This matches React: useLayoutEffect → paint → useEffect.
    expect(order).toEqual(['layout', 'passive'])
  })

  it('respects deps array', () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useLayoutEffect(() => { spy() }, [1])
    })
    flushLayoutEffects(instance)

    withInstance(instance, () => {
      useLayoutEffect(() => { spy() }, [1])  // same deps
    })
    flushLayoutEffects(instance)

    expect(spy).toHaveBeenCalledTimes(1)

    withInstance(instance, () => {
      useLayoutEffect(() => { spy() }, [2])  // changed deps
    })
    flushLayoutEffects(instance)

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('cleanup runs before next layout effect', () => {
    const instance = createInstance()
    const log: string[] = []

    withInstance(instance, () => {
      useLayoutEffect(() => {
        log.push('run-1')
        return () => log.push('cleanup-1')
      }, [1])
    })
    flushLayoutEffects(instance)

    withInstance(instance, () => {
      useLayoutEffect(() => {
        log.push('run-2')
        return () => log.push('cleanup-2')
      }, [2])
    })
    flushLayoutEffects(instance)

    expect(log).toEqual(['run-1', 'cleanup-1', 'run-2'])
  })
})