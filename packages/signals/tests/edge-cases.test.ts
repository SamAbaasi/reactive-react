import { describe, it, expect, vi } from 'vitest'
import { createSignal, effect, computed } from '../src/index'

describe('edge cases — Stage 1 acceptance', () => {

  // ─── Same-value bailout ─────────────────────────────────────────────────
  // Stage 1 requirement: setCount(5); setCount(5) — subscribers should NOT
  // be notified the second time. This is "best effort" semantics matching
  // React's Object.is comparison.

  describe('same-value bailout', () => {
    it('does not notify when set to the same value (Object.is)', () => {
      const [count, setCount] = createSignal(5)
      const spy = vi.fn()

      effect(() => spy(count()))
      expect(spy).toHaveBeenCalledTimes(1)

      setCount(5)
      expect(spy).toHaveBeenCalledTimes(1) // no notification — same value

      setCount(5)
      setCount(5)
      expect(spy).toHaveBeenCalledTimes(1) // still no notifications
    })

    it('does notify when value actually changes', () => {
      const [count, setCount] = createSignal(0)
      const spy = vi.fn()

      effect(() => spy(count()))
      expect(spy).toHaveBeenCalledTimes(1)

      setCount(1)
      expect(spy).toHaveBeenCalledTimes(2)

      setCount(1)              // same — no notification
      expect(spy).toHaveBeenCalledTimes(2)

      setCount(2)              // different — notify
      expect(spy).toHaveBeenCalledTimes(3)
    })

    it('uses Object.is semantics — NaN compared with NaN is equal', () => {
      // Object.is(NaN, NaN) === true (unlike ===)
      const [val, setVal] = createSignal<number>(NaN)
      const spy = vi.fn()

      effect(() => spy(val()))
      expect(spy).toHaveBeenCalledTimes(1)

      setVal(NaN)
      expect(spy).toHaveBeenCalledTimes(1) // NaN === NaN under Object.is, no notification
    })

    it('uses Object.is semantics — +0 and -0 are NOT equal', () => {
      // Object.is(+0, -0) === false (unlike ===)
      const [val, setVal] = createSignal(0)
      const spy = vi.fn()

      effect(() => spy(val()))
      expect(spy).toHaveBeenCalledTimes(1)

      setVal(-0)
      expect(spy).toHaveBeenCalledTimes(2) // +0 !== -0 under Object.is, notify
    })

    it('object references — set to a new object is always a notification', () => {
      // Object.is on different object refs is false, even if contents match
      const obj = { count: 1 }
      const [state, setState] = createSignal(obj)
      const spy = vi.fn()

      effect(() => spy(state()))
      expect(spy).toHaveBeenCalledTimes(1)

      setState(obj)
      expect(spy).toHaveBeenCalledTimes(1) // same reference — no notify

      setState({ count: 1 })
      expect(spy).toHaveBeenCalledTimes(2) // new reference — notify
    })
  })

  // ─── Async tracking failure ────────────────────────────────────────────
  // Stage 1 requirement: signals read inside setTimeout, await, requestAnimationFrame
  // callbacks do NOT track. The observer stack is synchronous — by the time
  // the async callback runs, the effect has already popped off the stack.
  // This is documented behavior, not a bug.

  describe('async tracking failure', () => {
    it('signals read inside setTimeout do NOT subscribe the effect', async () => {
      const [count, setCount] = createSignal(0)
      const innerRead = vi.fn()

      effect(() => {
        setTimeout(() => {
          innerRead(count()) // happens AFTER the effect's stack frame ends
        }, 0)
      })

      // Wait for the setTimeout to fire
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(innerRead).toHaveBeenCalledTimes(1)
      expect(innerRead).toHaveBeenCalledWith(0)

      // Change the signal — the inner setTimeout should NOT re-trigger
      // because the effect never registered as a subscriber
      setCount(1)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(innerRead).toHaveBeenCalledTimes(1) // still 1, no re-fire
    })

    it('signals read inside Promise.resolve().then do NOT track', async () => {
      const [count, setCount] = createSignal(0)
      const innerRead = vi.fn()

      effect(() => {
        Promise.resolve().then(() => {
          innerRead(count())
        })
      })

      await Promise.resolve()
      await Promise.resolve() // let the microtask flush
      expect(innerRead).toHaveBeenCalledTimes(1)

      setCount(1)
      await Promise.resolve()
      await Promise.resolve()

      expect(innerRead).toHaveBeenCalledTimes(1) // not re-fired
    })

    it('synchronous reads inside the same effect DO track normally', () => {
      // Sanity check: confirm sync reads still work, to make sure
      // the async non-tracking is the specific issue, not a broken effect.
      const [count, setCount] = createSignal(0)
      const spy = vi.fn()

      effect(() => {
        spy(count()) // SYNC read — tracks
      })

      expect(spy).toHaveBeenCalledTimes(1)
      setCount(1)
      expect(spy).toHaveBeenCalledTimes(2)
    })
  })

  // ─── Cycle behavior ─────────────────────────────────────────────────────
  // Stage 1 requirement: "must not infinite loop"
  // Setting a signal you depend on creates a self-update. The wave-based
  // scheduler should NOT re-enter the same effect within one wave.
  // The current implementation handles this because pendingEffects.clear()
  // happens BEFORE the wave runs, so re-adding mid-wave queues for the
  // next wave — but the test verifies the loop terminates.

  describe('cycle behavior', () => {
    it('writing to a signal you depend on does not infinite-loop', () => {
      const [count, setCount] = createSignal(0)
      const spy = vi.fn()

      effect(() => {
        spy(count())
        // Self-write inside the effect — naive implementations infinite-loop here
        if (count() < 3) {
          setCount(count() + 1)
        }
      })

      // The effect should run a bounded number of times and then stop.
      // Specifically: count goes 0 → 1 → 2 → 3, then no more self-writes.
      // The test passes as long as it terminates without hanging.
      expect(spy.mock.calls.length).toBeLessThan(100)
      expect(count()).toBeGreaterThanOrEqual(3)
    })

    it('two signals that update each other terminate (eventually)', () => {
      // a fires effect → effect sets b → effect on b fires → sets a → ...
      // The wave scheduler keeps each wave bounded, so this should terminate
      // when same-value bailout kicks in.
      const [a, setA] = createSignal(0)
      const [b, setB] = createSignal(0)
      const aSpy = vi.fn()
      const bSpy = vi.fn()

      effect(() => {
        aSpy(a())
        if (a() < 5 && a() !== b()) setB(a())
      })

      effect(() => {
        bSpy(b())
        if (b() < 5 && a() !== b()) setA(b() + 1)
      })

      // The system should reach a steady state, not infinite-loop.
      // Without a strict assertion on counts, we just verify completion.
      expect(aSpy.mock.calls.length).toBeLessThan(100)
      expect(bSpy.mock.calls.length).toBeLessThan(100)
    })
  })
})