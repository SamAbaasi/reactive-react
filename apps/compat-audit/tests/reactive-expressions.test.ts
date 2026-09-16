import { afterEach, expect, it } from 'vitest'
import { unmountNode } from '@rrjs/renderer'
import { click, run } from './harness'

afterEach(() => {
  for (const child of Array.from(document.body.childNodes)) unmountNode(child)
})

it('preserves local declarations in map callbacks', () => {
  const result = run(`function App() {
    const [items, setItems] = useState([{id: 1, name: 'one'}]);
    return <div><button onClick={() => setItems([{id: 1, name: 'two'}])}>change</button>
      <ul>{items().map(item => { const label = item.name.toUpperCase(); return <li key={item.id}>{label}</li>; })}</ul>
    </div>;
  }`, 'App')
  expect(result.error).toBeNull()
  expect(result.container.querySelector('li')!.textContent).toBe('ONE')
  click(result.container, 'button')
  expect(result.container.querySelector('li')!.textContent).toBe('TWO')
})

it('preserves map indices and source-array arguments after reordering', () => {
  const result = run(`function App() {
    const [items, setItems] = useState([{id: 1}, {id: 2}]);
    return <div><button onClick={() => setItems(items().slice().reverse())}>reverse</button>
      <ul>{items().map((item, index, source) => <li key={item.id}>{item.id + ':' + index + '/' + source.length}</li>)}</ul>
    </div>;
  }`, 'App')
  expect(result.error).toBeNull()
  const rows = () => Array.from(result.container.querySelectorAll('li'), li => li.textContent)
  expect(rows()).toEqual(['1:0/2', '2:1/2'])
  click(result.container, 'button')
  expect(rows()).toEqual(['2:0/2', '1:1/2'])
})

it('updates a getter call used directly as a JSX child', () => {
  const result = run(`function App() {
    const [count, setCount] = useState(0);
    return <div><button onClick={() => setCount(n => n + 1)}>add</button><output>{count()}</output></div>;
  }`, 'App')
  expect(result.error).toBeNull()
  expect(result.container.querySelector('output')!.textContent).toBe('0')
  click(result.container, 'button')
  expect(result.container.querySelector('output')!.textContent).toBe('1')
})

it('tracks signal reads inside a formatting helper', () => {
  const result = run(`function App() {
    const [count, setCount] = useState(0);
    const format = () => 'Count: ' + count();
    return <div><button onClick={() => setCount(n => n + 1)}>add</button><output>{format()}</output></div>;
  }`, 'App')
  expect(result.error).toBeNull()
  click(result.container, 'button')
  expect(result.container.querySelector('output')!.textContent).toBe('Count: 1')
})
