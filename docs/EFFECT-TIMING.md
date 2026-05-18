# Effect Timing

When `useEffect` runs, when `useLayoutEffect` runs, and why the distinction matters more than developers usually think.

---

## The Three Timing Slots

Reactive React schedules effects into three slots, in this order:

1. **Layout effects** — run synchronously inside `mount()`, before paint
2. **Browser paint** — the rendering engine draws to the screen
3. **Passive effects** — run asynchronously via `MessageChannel`, after paint

```
Frame timeline:

   mount() returns ──┐
                     │
   Layout effects ───┤  ← synchronous, blocks paint
                     │
   Browser paint ────┤  ← user sees the result
                     │
   ...new task...
                     │
   Passive effects ──┘  ← runs in a fresh macro task
```

---

## `useLayoutEffect`

Runs synchronously during the commit phase, before the browser paints.

Use for:
- DOM measurements that need final layout (`getBoundingClientRect`)
- Synchronizing scroll position or focus
- Anything where the user must not see the intermediate state

The cost: it blocks paint. Don't use this unless you have a specific reason. Prefer `useEffect`.

```tsx
function Tooltip() {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width}px`
    }
  }, [])

  return <div ref={ref} class="tooltip">…</div>
}
```

---

## `useEffect`

Runs asynchronously after the browser paints. Scheduled via `MessageChannel.postMessage`, which guarantees a new macro task — the browser will paint between commit and effect execution.

Use for:
- Subscriptions, listeners, timers
- Network requests
- Any side effect the user doesn't need to wait on

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  useEffect(() => {
    const conn = createConnection(roomId)
    conn.connect()
    return () => conn.disconnect()
  }, [roomId])

  return <div>…</div>
}
```

---

## Why `MessageChannel` and not `queueMicrotask`?

A microtask runs after the current synchronous block but **before** the browser paints. If `useEffect` used microtasks, every effect would block paint just like `useLayoutEffect` — defeating its entire purpose.

`MessageChannel.postMessage` enqueues a message that delivers on the next macro task. Between macro tasks, the browser is free to paint.

This is the same mechanism React's Scheduler uses for the same reason.

---

## Cleanup Order

Both effect types support cleanup. The cleanup function returned by the effect runs:
1. Before the next effect run (if deps changed)
2. When the component unmounts

Cleanups always run **before** the new effect body. This matters when the cleanup tears down a subscription that the new effect is about to re-create.

```tsx
useEffect(() => {
  console.log('subscribed')
  return () => console.log('unsubscribed')
}, [id])

// Log on id change [1 → 2]:
//   unsubscribed   ← cleanup from id=1
//   subscribed     ← new effect for id=2
```

This ordering is identical to React's.

---

## Performance Implications

The single biggest performance question developers ask about effects is: "Why does my component freeze on first render?"

The answer is almost always a `useLayoutEffect` doing expensive work. Layout effects block paint. If you do 50ms of work in a layout effect, the user sees a 50ms freeze.

Always default to `useEffect`. Only reach for `useLayoutEffect` when you specifically need to prevent a visible intermediate state.

---

## A Common Anti-Pattern

```tsx
// ❌ wrong — blocks paint for a network request
useLayoutEffect(() => {
  fetch('/api/data').then(setData)
}, [])

// ✓ correct — paints first, fetches after
useEffect(() => {
  fetch('/api/data').then(setData)
}, [])
```

Network requests, timers, and subscriptions belong in `useEffect`. The user should see your component before any of these begin.

---

## Documented Timing Bugs in Other Frameworks

This is the layer where most "React-like" libraries get it wrong:

- Some use `queueMicrotask` for `useEffect`, causing paint blocks
- Some use `setTimeout(0)`, which is slower than `MessageChannel`
- Some run effects synchronously inside `mount()`, conflating layout and passive timing

Reactive React uses `MessageChannel` for passive effects and synchronous calls for layout effects. This matches React's contract exactly.

---

## Summary Table

| Property | `useEffect` | `useLayoutEffect` |
|----------|-------------|-------------------|
| When | After paint | Before paint |
| Mechanism | `MessageChannel` macro task | Synchronous call in `mount()` |
| Blocks paint? | No | Yes |
| Use for | Subscriptions, async work, side effects | DOM measurement, sync DOM mutations |
| Default choice | Yes | No — only when needed |