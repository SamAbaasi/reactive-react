import { signal, computed } from './03-batch.mjs'
import { h } from './04-dom.mjs'

function Counter() {
  console.count('Counter body ran')
  const [count, setCount] = signal(0)
  const doubled = computed(() => count() * 2)
  return h('button', { onClick: () => setCount(count() + 1) },
    'Clicked ', count, ' times, doubled ', doubled)
}

document.body.append(h(Counter))
