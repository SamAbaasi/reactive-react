// Q1 — "run unmodified React components on signals"
//
// Five components in the style React's own documentation uses, written the way a
// React developer writes them: useState destructured to a VALUE, className,
// onChange, style objects, .map() over a list, useRef + useEffect.
//
// Nothing here is adapted for @rrjs. The point is to find out what happens when
// genuinely unmodified React source meets this pipeline, and to record the FIRST
// thing that breaks in each case.
import { describe, it, expect, afterAll } from 'vitest'
import { run, text, click, record, printMatrix } from './harness'

describe('Q1 — unmodified React components', () => {
  it('1. Counter — useState destructured to a value', () => {
    const src = `
      function Counter() {
        const [count, setCount] = useState(0);
        function handleClick() {
          setCount(count + 1);
        }
        return (
          <button onClick={handleClick}>
            You pressed me {count} times
          </button>
        );
      }`
    const r = run(src, 'Counter')

    const initial = r.error ? `THREW: ${r.error.message}` : text(r.container)
    let afterClick = 'n/a'
    if (!r.error) {
      try {
        click(r.container, 'button')
        afterClick = text(r.container)
      } catch (e) {
        afterClick = `THREW: ${(e as Error).message}`
      }
    }

    record(
      'Counter (useState value)',
      r.error ? 'neither' : afterClick === 'You pressed me 1 times' ? 'renders+updates' : 'renders, no update',
      `initial="${initial}" afterClick="${afterClick}"`
    )
    expect(initial).toBeDefined()
  })

  it('2. List — .map() assigned to a variable first', () => {
    const src = `
      function List() {
        const people = [
          { id: 0, name: 'Creola' },
          { id: 1, name: 'Mario' },
          { id: 2, name: 'Mohammad' }
        ];
        const listItems = people.map(person =>
          <li key={person.id}>{person.name}</li>
        );
        return <ul>{listItems}</ul>;
      }`
    const r = run(src, 'List')
    const out = r.error ? `THREW: ${r.error.message}` : text(r.container)
    const items = r.error ? -1 : r.container.querySelectorAll('li').length
    record(
      'List (.map to variable)',
      r.error ? 'neither' : items === 3 ? 'renders' : 'renders wrong',
      `items=${items} text="${out}"`
    )
    expect(out).toBeDefined()
  })

  it('3. Item — className, props, && conditional', () => {
    const src = `
      function Item(props) {
        return (
          <li className="item">
            {props.name} {props.isPacked && '✔'}
          </li>
        );
      }
      function PackingList() {
        return (
          <ul>
            <Item name="Space suit" isPacked={true} />
            <Item name="Helmet" isPacked={false} />
          </ul>
        );
      }`
    const r = run(src, 'PackingList')
    const out = r.error ? `THREW: ${r.error.message}` : text(r.container)
    const cls = r.error ? 'n/a' : (r.container.querySelector('li')?.className ?? '(none)')
    record(
      'Item (className + &&)',
      r.error ? 'neither' : cls === 'item' ? 'renders' : 'renders wrong',
      `className="${cls}" text="${out}"`
    )
    expect(out).toBeDefined()
  })

  it('4. Form — controlled input, onChange, value', () => {
    const src = `
      function Form() {
        const [text, setText] = useState('hello');
        return (
          <div>
            <input value={text} onChange={e => setText(e.target.value)} />
            <p>You typed: {text}</p>
            <button onClick={() => setText('reset')}>Reset</button>
          </div>
        );
      }`
    const r = run(src, 'Form')
    const initial = r.error ? `THREW: ${r.error.message}` : text(r.container)
    let inputValue = 'n/a'
    let afterReset = 'n/a'
    if (!r.error) {
      inputValue = (r.container.querySelector('input') as HTMLInputElement)?.value ?? '(none)'
      try {
        click(r.container, 'button')
        afterReset = text(r.container)
      } catch (e) {
        afterReset = `THREW: ${(e as Error).message}`
      }
    }
    record(
      'Form (controlled input)',
      r.error ? 'neither' : afterReset.includes('reset') ? 'renders+updates' : 'renders, no update',
      `initialText="${initial}" input.value="${inputValue}" afterReset="${afterReset}"`
    )
    expect(initial).toBeDefined()
  })

  it('5. Box — style object with plain values', () => {
    const src = `
      function Box() {
        return (
          <div style={{ backgroundColor: 'black', color: 'pink', width: 100 }}>
            Hello
          </div>
        );
      }`
    const r = run(src, 'Box')
    const el = r.error ? null : (r.container.querySelector('div') as HTMLElement | null)
    record(
      'Box (style object)',
      r.error ? 'neither' : el && el.style.backgroundColor === 'black' ? 'renders' : 'renders wrong',
      r.error ? `THREW: ${r.error.message}` : `style.backgroundColor="${el?.style.backgroundColor}" style.color="${el?.style.color}"`
    )
    expect(true).toBe(true)
  })

  it('6. VideoPlayer — useRef + useEffect touching the DOM node', () => {
    const src = `
      function VideoPlayer(props) {
        const ref = useRef(null);
        useEffect(() => {
          if (ref.current) { ref.current.setAttribute('data-effect-ran', 'yes'); }
        });
        return <video ref={ref} src={props.src} loop playsInline />;
      }`
    const r = run(src, 'VideoPlayer')
    const el = r.error ? null : r.container.querySelector('video')
    record(
      'VideoPlayer (useRef+useEffect)',
      r.error ? 'neither' : el ? 'renders' : 'renders wrong',
      r.error ? `THREW: ${r.error.message}` : `ref attached=${!!el} (effect is async; checked separately)`
    )
    expect(true).toBe(true)
  })

  afterAll(() => printMatrix('Q1 — unmodified React components through @rrjs'))
})
