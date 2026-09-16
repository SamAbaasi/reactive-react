// Q1 — "run unmodified React components on signals"
//
// Six components in the style React's own documentation uses, written the way a
// React developer writes them: useState destructured to a VALUE, className,
// onChange, style objects, .map() over a list, useRef + useEffect.
//
// Nothing here is adapted for @rrjs, and nothing here selects a compiler option:
// each case compiles with the plugin's defaults, so this file states what a
// consumer gets from unmodified React source without configuring anything.
//
// Every case asserts the actual result. A case that stops rendering, stops
// updating, or starts being rejected fails here.
import { describe, it, expect, beforeEach } from 'vitest'
import { run, text, click, compileDefault } from './harness'

const render = (source: string, component: string) => {
  const result = run(source, component, compileDefault)
  if (result.error) throw result.error
  return result
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40 && !predicate(); attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
  expect(predicate()).toBe(true)
}

describe('Q1 — unmodified React components', () => {
  beforeEach(() => { document.title = '' })

  it('1. Counter — useState destructured to a value', () => {
    const r = render(`
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
      }`, 'Counter')
    expect(text(r.container)).toBe('You pressed me 0 times')
    click(r.container, 'button')
    expect(text(r.container)).toBe('You pressed me 1 times')
    click(r.container, 'button')
    expect(text(r.container)).toBe('You pressed me 2 times')
  })

  it('2. List — .map() assigned to a variable first', () => {
    const r = render(`
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
      }`, 'List')
    expect(r.container.querySelectorAll('li').length).toBe(3)
    expect(text(r.container)).toBe('CreolaMarioMohammad')
    expect(r.container.querySelector('ul > li')).not.toBeNull()
  })

  it('3. Item — className, props, && conditional', () => {
    const r = render(`
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
      }`, 'PackingList')
    const items = r.container.querySelectorAll('li')
    expect(items.length).toBe(2)
    expect(items[0].className).toBe('item')
    expect(items[1].className).toBe('item')
    expect(text(items[0] as HTMLElement)).toBe('Space suit ✔')
    expect(text(items[1] as HTMLElement)).toBe('Helmet')
  })

  it('4. Form — controlled input, onChange, value', () => {
    const r = render(`
      function Form() {
        const [text, setText] = useState('hello');
        return (
          <div>
            <input value={text} onChange={e => setText(e.target.value)} />
            <p>You typed: {text}</p>
            <button onClick={() => setText('reset')}>Reset</button>
          </div>
        );
      }`, 'Form')
    const input = r.container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('hello')
    expect(text(r.container.querySelector('p') as HTMLElement)).toBe('You typed: hello')

    input.value = 'typed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(text(r.container.querySelector('p') as HTMLElement)).toBe('You typed: typed')

    click(r.container, 'button')
    expect(text(r.container.querySelector('p') as HTMLElement)).toBe('You typed: reset')
    expect(input.value).toBe('reset')
  })

  it('5. Box — style object with plain values', () => {
    const r = render(`
      function Box() {
        return (
          <div style={{ backgroundColor: 'black', color: 'pink', width: 100 }}>
            Hello
          </div>
        );
      }`, 'Box')
    const el = r.container.querySelector('div') as HTMLElement
    expect(el.style.backgroundColor).toBe('black')
    expect(el.style.color).toBe('pink')
    expect(text(r.container)).toBe('Hello')
  })

  it('6. VideoPlayer — useRef + useEffect touching the DOM node', async () => {
    const r = render(`
      function VideoPlayer(props) {
        const ref = useRef(null);
        useEffect(() => {
          if (ref.current) { ref.current.setAttribute('data-effect-ran', 'yes'); }
        });
        return <video ref={ref} src={props.src} loop playsInline />;
      }`, 'VideoPlayer')
    const video = r.container.querySelector('video') as HTMLElement
    expect(video).not.toBeNull()
    expect(video.hasAttribute('loop')).toBe(true)
    await until(() => video.getAttribute('data-effect-ran') === 'yes')
  })
})
