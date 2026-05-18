import { mount } from '@rrjs/renderer'
import {
  useState,
  useMemo,
  useEffect,
} from '@rrjs/react-compat'
import { h } from '@rrjs/renderer'

;(globalThis as any).h = h

let componentRuns = 0

function App() {
  componentRuns++

  const [count, setCount] = useState(0)
  const doubled = useMemo(() => count() * 2, [count])
  const status = useMemo(
    () => (count() > 10 ? 'You clicked a lot!' : 'Keep clicking'),
    [count]
  )

  useEffect(() => {
    document.title = `Count: ${count()}`
  }, [count])

  return (
    <div>
      <div className="display">Count: {count}</div>
      <div className="display">Doubled: {doubled}</div>
      <div>{status}</div>

      <div style={{ marginTop: '1.5rem' }}>
        <button onClick={() => setCount(count() + 1)}>Increment</button>
        <button onClick={() => setCount(count() - 1)}>Decrement</button>
        <button onClick={() => setCount(0)}>Reset</button>
      </div>

      <div className="log">
        Component function ran:{' '}
        {() =>
          `${componentRuns} time${componentRuns === 1 ? '' : 's'} (signals update the DOM directly — no re-runs)`
        }
      </div>
    </div>
  )
}

mount(App as any, document.getElementById('app')!)