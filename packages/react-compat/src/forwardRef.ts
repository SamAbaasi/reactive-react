import type { RefObject } from './hooks/useRef'

// A "function ref" or an object ref — both forms are supported, like React.
export type Ref<T> = ((instance: T | null) => void) | RefObject<T> | null

// The marker that lets the renderer know this is a forwardRef wrapper.
// We use a Symbol so it's unambiguous and cannot collide with user code.
export const FORWARD_REF = Symbol('forwardRef')

export interface ForwardRefComponent<P, T> {
  (props: P & { ref?: Ref<T> }): any
  [FORWARD_REF]: true
  _render: (props: P, ref: Ref<T>) => any
}

// forwardRef wraps a function component that accepts (props, ref) and returns
// a callable component that the renderer recognizes. When the renderer sees
// the FORWARD_REF marker, it extracts the ref prop and passes it as the second
// argument to the user's render function.

export function forwardRef<P, T>(
  render: (props: P, ref: Ref<T>) => any
): ForwardRefComponent<P, T> {
  const component = ((props: P & { ref?: Ref<T> }) => {
    // Direct invocation path — extract ref, call user render.
    // The renderer will normally take the FORWARD_REF path instead and
    // call _render directly. This branch is for completeness.
    const { ref, ...rest } = props as any
    return render(rest as P, ref ?? null)
  }) as ForwardRefComponent<P, T>

  component[FORWARD_REF] = true
  component._render = render
  return component
}

export function isForwardRef(value: unknown): value is ForwardRefComponent<any, any> {
  return (
    typeof value === 'function' &&
    (value as any)[FORWARD_REF] === true
  )
}