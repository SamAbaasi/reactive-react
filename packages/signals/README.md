# @reactive-react/signals

The reactive primitive layer. Used by every other package in the Reactive React project. Can be used directly when you need fine-grained reactivity without a UI library.

## Install

```bash
npm install @reactive-react/signals
```

## Quick start

```js
import { createSignal, effect, computed } from '@reactive-react/signals'

const [count, setCount] = createSignal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  console.log(`count=${count()}, doubled=${doubled()}`)
})
// → "count=0, doubled=0"

setCount(5)
// → "count=5, doubled=10"
```

## API

### `createSignal(initial)`

Returns `[getter, setter]`. Reading the getter inside an `effect` or `computed` subscribes that effect to changes.

```js
const [name, setName] = createSignal('Alice')
name()          // 'Alice'
setName('Bob')
name()          // 'Bob'
```

The setter accepts a functional updater:

```js
setName(prev => prev.toUpperCase())
```

Same-value writes use `Object.is` and skip notification.

### `computed(fn)`

A derived signal. Returns a getter. The function re-runs only when its tracked dependencies change.

```js
const [a, setA] = createSignal(2)
const [b, setB] = createSignal(3)
const sum = computed(() => a() + b())

sum()          // 5
setA(10)
sum()          // 13
```

Handles diamond dependencies correctly — a downstream computed fires exactly once when a shared upstream signal changes.

### `effect(fn)`

Runs `fn` immediately, then re-runs it whenever any signal read inside changes.

```js
const dispose = effect(() => {
  console.log(count())
  return () => console.log('cleanup')   // optional cleanup
})

dispose()      // stop re-running, run final cleanup
```

Returns a dispose function. Cleanups run in reverse order: previous-cleanup → next-effect-run.

### `batch(fn)`

Defers effect flushing until `fn` returns. Multiple signal writes inside `batch` produce one flush.

```js
batch(() => {
  setA(1)
  setB(2)
  setC(3)
})
// Effects depending on a, b, c run once, not three times
```

## Edge cases

- **Async tracking**: signals read inside `setTimeout`, `await`, or `requestAnimationFrame` callbacks do **not** track. The observer stack is synchronous.
- **Cycles**: writing to a signal you're currently tracking is allowed but may cause unintended re-runs. The library does not detect cycles automatically.
- **Same-value writes**: `setCount(5); setCount(5)` only notifies once. Uses `Object.is`, so `NaN` compared with itself is equal, and `+0` and `-0` are not.

## License

MIT