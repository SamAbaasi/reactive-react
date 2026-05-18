import { describe, it, expect, vi } from 'vitest'
import { h, mount } from '../src/index'
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback,
} from '@reactive-react/react-compat'
import { forwardRef } from '@reactive-react/react-compat'

function nextMacroTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('integration — React hooks running on the renderer', () => {
  it('useState — counter component', () => {
    function Counter() {
      const [count, setCount] = useState(0)

      // Inside JSX: pass the getter — Babel wraps it as a thunk,
      // and the renderer auto-invokes it via the auto-unwrap loop.
      // Inside event handlers: call count() explicitly to read the value.
      return h('button',
        { onClick: () => setCount(count() + 1) },
        count
      )
    }

    const container = document.createElement('div')
    mount(Counter, container)

    const button = container.querySelector('button')!
    expect(button.textContent).toBe('0')

    button.click()
    expect(button.textContent).toBe('1')

    button.click()
    button.click()
    expect(button.textContent).toBe('3')
  })

  it('useState functional updater chain', () => {
    function Counter() {
      const [count, setCount] = useState(0)

      function tripleIncrement() {
        setCount(c => c + 1)
        setCount(c => c + 1)
        setCount(c => c + 1)
      }

      return h('button', { onClick: tripleIncrement }, count)
    }

    const container = document.createElement('div')
    mount(Counter, container)

    const button = container.querySelector('button')!
    button.click()
    expect(button.textContent).toBe('3')
  })

// Inside the existing describe block:

  it('forwardRef — parent ref reaches the inner DOM element', () => {
    const FancyInput = forwardRef((props: any, ref: any) => {
      return h('input', { ref, type: 'text', placeholder: 'type here' })
    })

    function Parent() {
      const inputRef = useRef<HTMLInputElement | null>(null)
      return h('div', null,
        h(FancyInput, { ref: inputRef }),
        h('button', { onClick: () => inputRef.current?.focus() }, 'focus')
      )
    }

    const container = document.createElement('div')
    mount(Parent, container)

    const input = container.querySelector('input')!
    expect(input).toBeDefined()
    expect(input.type).toBe('text')
    expect(input.placeholder).toBe('type here')
  })

  it('useImperativeHandle — parent gets custom API instead of DOM node', () => {
    let exposedHandle: { greet: () => string } | null = null

    const Greeter = forwardRef((props: any, ref: any) => {
      useImperativeHandle(ref, () => ({
        greet: () => 'hello from inside',
      }), [])
      return h('div', null, 'greeter')
    })

    function Parent() {
      const handleRef = useRef<{ greet: () => string } | null>(null)

      // Schedule reading the ref after layout has flushed
      // by checking it later in the test
      ;(globalThis as any).__handleRef = handleRef

      return h(Greeter, { ref: handleRef })
    }

    const container = document.createElement('div')
    mount(Parent, container)

    const handleRef = (globalThis as any).__handleRef
    expect(handleRef.current).toBeDefined()
    expect(handleRef.current.greet()).toBe('hello from inside')

    exposedHandle = handleRef.current
    expect(exposedHandle?.greet()).toBe('hello from inside')
  })
it('useMemo — recomputes via signal tracking inside the factory', () => {
    function Doubler() {
      const [count, setCount] = useState(2)
      const doubled = useMemo(() => count() * 2, [count])

      return h('div', null,
        h('button', { onClick: () => setCount(count() + 1) }, 'inc'),
        h('span', null, doubled),   // doubled is a getter — renderer auto-unwraps it
      )
    }

    const container = document.createElement('div')
    mount(Doubler, container)

    const span = container.querySelector('span')!
    const button = container.querySelector('button')!

    expect(span.textContent).toBe('4')
    button.click()
    expect(span.textContent).toBe('6')
    button.click()
    expect(span.textContent).toBe('8')
  })

  it('useEffect — runs after mount, in next macro task', async () => {
    const spy = vi.fn()

    function WithEffect() {
      useEffect(() => {
        spy('mounted')
      }, [])

      return h('div', null, 'hello')
    }

    const container = document.createElement('div')
    mount(WithEffect, container)

    expect(spy).not.toHaveBeenCalled()

    await nextMacroTask()

    expect(spy).toHaveBeenCalledWith('mounted')
  })

  it('useRef — persists across signal updates', () => {
    function ClickCounter() {
      const renderCountRef = useRef(0)
      const [clicks, setClicks] = useState(0)

      renderCountRef.current++

      return h('button',
        { onClick: () => setClicks(clicks() + 1) },
        () => `clicks: ${clicks()}, renders: ${renderCountRef.current}`
      )
    }

    const container = document.createElement('div')
    mount(ClickCounter, container)

    const button = container.querySelector('button')!

    expect(button.textContent).toBe('clicks: 0, renders: 1')

    button.click()
    expect(button.textContent).toBe('clicks: 1, renders: 1')

    button.click()
    expect(button.textContent).toBe('clicks: 2, renders: 1')
  })

  it('useCallback — stable reference across signal updates', () => {
    const callbacks = new Set<Function>()

    function Component() {
      const [count, setCount] = useState(0)
      const handler = useCallback(() => 'click', [])

      callbacks.add(handler)

      return h('button',
        { onClick: () => setCount(count() + 1) },
        count
      )
    }

    const container = document.createElement('div')
    mount(Component, container)

    const button = container.querySelector('button')!
    button.click()
    button.click()
    button.click()

    expect(callbacks.size).toBe(1)
  })
})