import { describe, it, expect } from 'vitest'
import { forwardRef, isForwardRef } from '../src/forwardRef'
import { useRef } from '../src/hooks/useRef'
import { useImperativeHandle } from '../src/hooks/useImperativeHandle'
import { createInstance, withInstance, flushLayoutEffects } from '../src/instance'

describe('forwardRef', () => {
  it('creates a component that exposes the forwardRef marker', () => {
    const Component = forwardRef((props: any, ref: any) => null)
    expect(isForwardRef(Component)).toBe(true)
  })

  it('isForwardRef returns false for regular functions', () => {
    const NotForwarded = (props: any) => null
    expect(isForwardRef(NotForwarded)).toBe(false)
    expect(isForwardRef(() => {})).toBe(false)
    expect(isForwardRef(null)).toBe(false)
    expect(isForwardRef('not a function')).toBe(false)
  })

  it('forwarded component _render receives props and ref separately', () => {
    let receivedProps: any
    let receivedRef: any

    const Component = forwardRef((props: any, ref: any) => {
      receivedProps = props
      receivedRef = ref
      return null
    })

    const ref = { current: null }
    Component._render({ label: 'hello' }, ref)

    expect(receivedProps).toEqual({ label: 'hello' })
    expect(receivedRef).toBe(ref)
  })

  it('direct invocation also extracts ref from props', () => {
    let receivedProps: any
    let receivedRef: any

    const Component = forwardRef((props: any, ref: any) => {
      receivedProps = props
      receivedRef = ref
      return null
    })

    const ref = { current: null }
    Component({ label: 'hi', ref })

    expect(receivedProps).toEqual({ label: 'hi' })
    expect(receivedRef).toBe(ref)
  })
})

describe('useImperativeHandle', () => {
  it('attaches the custom handle to the ref after layout flush', () => {
    const instance = createInstance()
    const ref = { current: null as any }

    withInstance(instance, () => {
      useImperativeHandle(ref, () => ({ focus: () => 'focused' }))
    })

    // Not yet — layout effect hasn't flushed
    expect(ref.current).toBe(null)

    flushLayoutEffects(instance)

    expect(ref.current).toBeDefined()
    expect(ref.current.focus()).toBe('focused')
  })

  it('works with callback refs', () => {
    const instance = createInstance()
    let received: any = null

    const callbackRef = (value: any) => {
      received = value
    }

    withInstance(instance, () => {
      useImperativeHandle(callbackRef, () => ({ scroll: () => 'scrolled' }))
    })

    flushLayoutEffects(instance)

    expect(received).toBeDefined()
    expect(received.scroll()).toBe('scrolled')
  })

  it('does nothing if ref is null or undefined', () => {
    const instance = createInstance()

    // Should not throw
    withInstance(instance, () => {
      useImperativeHandle(undefined, () => ({ method: () => 'noop' }))
    })

    flushLayoutEffects(instance)

    // No assertion — passing without error is the contract
  })

  it('respects the dep array — does not re-attach when deps unchanged', () => {
    const instance = createInstance()
    const ref = { current: null as any }
    let factoryCallCount = 0

    withInstance(instance, () => {
      useImperativeHandle(ref, () => {
        factoryCallCount++
        return { id: factoryCallCount }
      }, [1])
    })
    flushLayoutEffects(instance)

    expect(factoryCallCount).toBe(1)
    expect(ref.current.id).toBe(1)

    // Re-render with same deps
    withInstance(instance, () => {
      useImperativeHandle(ref, () => {
        factoryCallCount++
        return { id: factoryCallCount }
      }, [1])
    })
    flushLayoutEffects(instance)

    // Same deps — factory NOT called again
    expect(factoryCallCount).toBe(1)
  })

  it('respects the dep array — re-attaches when deps change', () => {
    const instance = createInstance()
    const ref = { current: null as any }
    let factoryCallCount = 0

    withInstance(instance, () => {
      useImperativeHandle(ref, () => {
        factoryCallCount++
        return { id: factoryCallCount }
      }, [1])
    })
    flushLayoutEffects(instance)

    withInstance(instance, () => {
      useImperativeHandle(ref, () => {
        factoryCallCount++
        return { id: factoryCallCount }
      }, [2])
    })
    flushLayoutEffects(instance)

    expect(factoryCallCount).toBe(2)
    expect(ref.current.id).toBe(2)
  })
})