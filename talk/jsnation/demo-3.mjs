// node demo-3.mjs
import { signal, effect, computed, batch } from './03-batch.mjs'

const [first, setFirst] = signal('Ada')
const [last, setLast] = signal('Lovelace')
const full = computed(() => `${first()} ${last()}`)
effect(() => console.log('name:', full()))

setFirst('Grace')
setLast('Hopper')                    // two writes, two runs

batch(() => {
  setFirst('Alan')
  setLast('Turing')                  // two writes, one run
})
