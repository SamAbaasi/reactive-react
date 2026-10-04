// node demo-1-2.mjs 1   → step 1
// node demo-1-2.mjs 2   → step 2
const step = process.argv[2] === '2' ? './02-forget.mjs' : './01-signal.mjs'
const { signal, effect } = await import(step)

const [count, setCount] = signal(0)
effect(() => console.log('count is', count()))
setCount(1)
setCount(1)                          // the same value again

const [show, setShow] = signal(true)
const [name, setName] = signal('Ada')
effect(() => console.log(show() ? `hello ${name()}` : 'hidden'))
setShow(false)
setName('Grace')                     // nobody can see the name now
