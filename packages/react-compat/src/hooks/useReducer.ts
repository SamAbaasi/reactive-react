import { createSignal } from '@reactive-react/signals'
import { getCurrentInstance } from '../instance'

type Reducer<S, A> = (state: S, action: A) => S
type Dispatch<A> = (action: A) => void

interface UseReducerHook<S, A> {
  getter: () => S
  dispatch: Dispatch<A>
}

// useReducer is conceptually useState with a custom transition function.
// Same getter-based API: returns [stateGetter, dispatch].
//
// Inside the dispatch wrapper:
//   1. Read the current state through the getter
//   2. Apply the reducer to get the next state
//   3. Write the result through the signal setter
//
// The reducer captured by useReducer must be stable across renders
// for the dispatch reference to also be stable. We capture it on the
// first render and keep using that captured reducer thereafter.
// (This matches React's behavior exactly — React only uses the reducer
// from the most recent render at dispatch time, but in our model components
// don't re-render so we use the first one. We'll address this nuance later
// if it turns out to matter in practice.)

export function useReducer<S, A>(
  reducer: Reducer<S, A>,
  initialState: S
): [() => S, Dispatch<A>]
export function useReducer<S, A, I>(
  reducer: Reducer<S, A>,
  initialArg: I,
  init: (arg: I) => S
): [() => S, Dispatch<A>]
export function useReducer<S, A>(
  reducer: Reducer<S, A>,
  initialArg: any,
  init?: (arg: any) => S
): [() => S, Dispatch<A>] {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (instance.hooks[i] === undefined) {
    // Lazy initialisation if init is provided
    // useReducer(reducer, props.initial, (initial) => ({ count: initial }))
    const initialState: S = init !== undefined ? init(initialArg) : initialArg

    const [getter, setter] = createSignal<S>(initialState)

    const dispatch: Dispatch<A> = (action: A) => {
      const currentState = getter()
      const nextState = reducer(currentState, action)
      setter(nextState)
    }

    instance.hooks[i] = { getter, dispatch } as UseReducerHook<S, A>
  }

  const hook = instance.hooks[i] as UseReducerHook<S, A>
  return [hook.getter, hook.dispatch]
}