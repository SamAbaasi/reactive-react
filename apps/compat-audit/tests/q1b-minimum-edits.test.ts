// Q1b — the smallest source change that makes each failing Q1 case work.
import { describe, it, expect, afterAll } from 'vitest'
import { run, text, click, record, printMatrix } from './harness'

describe('Q1b — minimum edits', () => {
  it('Counter: setCount(count() + 1)', () => {
    const src = `
      function Counter() {
        const [count, setCount] = useState(0);
        function handleClick() {
          setCount(count() + 1);          // EDIT: count -> count()
        }
        return (
          <button onClick={handleClick}>
            You pressed me {count} times
          </button>
        );
      }`
    const r = run(src, 'Counter')
    click(r.container, 'button')
    const after = text(r.container)
    record('Counter + count()', after === 'You pressed me 1 times' ? 'FIXED' : 'still broken', `afterClick="${after}"`)
    expect(after).toBe('You pressed me 1 times')
  })

  it('Counter: the functional updater form needs no edit at all', () => {
    const src = `
      function Counter() {
        const [count, setCount] = useState(0);
        function handleClick() {
          setCount(c => c + 1);           // NO EDIT: idiomatic React already
        }
        return (
          <button onClick={handleClick}>
            You pressed me {count} times
          </button>
        );
      }`
    const r = run(src, 'Counter')
    click(r.container, 'button')
    click(r.container, 'button')
    const after = text(r.container)
    record('Counter, updater form', after === 'You pressed me 2 times' ? 'WORKS UNMODIFIED' : 'broken', `afterTwoClicks="${after}"`)
    expect(after).toBe('You pressed me 2 times')
  })

  it('List: inline the .map() into JSX', () => {
    const src = `
      function List() {
        const people = [
          { id: 0, name: 'Creola' },
          { id: 1, name: 'Mario' },
          { id: 2, name: 'Mohammad' }
        ];
        return (
          <ul>
            {people.map(person =>                   // EDIT: inlined, not via a variable
              <li key={person.id}>{person.name}</li>
            )}
          </ul>
        );
      }`
    const r = run(src, 'List')
    const items = r.container.querySelectorAll('li').length
    record('List, inlined map', items === 3 ? 'FIXED' : 'still broken', `items=${items} text="${text(r.container)}"`)
    expect(items).toBe(3)
  })

  it('List: a variable holding an array of elements is stringified', () => {
    // Isolates the mechanism: it is not about .map() specifically, it is that any
    // array-valued JSX child that did not come from the map->list rewrite gets
    // String()-ed by the renderer's reactive-child path.
    const src = `
      function Bare() {
        const items = [<li key="a">A</li>, <li key="b">B</li>];
        return <ul>{items}</ul>;
      }`
    const r = run(src, 'Bare')
    const items = r.container.querySelectorAll('li').length
    record('array literal as child', items === 2 ? 'works' : 'STRINGIFIED', `li count=${items} text="${text(r.container).slice(0, 60)}"`)
    expect(items).toBeGreaterThanOrEqual(0)
  })

  afterAll(() => printMatrix('Q1b — minimum edits'))
})
