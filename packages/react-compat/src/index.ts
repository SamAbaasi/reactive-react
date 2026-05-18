export { useRef } from './hooks/useRef'
export type { RefObject } from './hooks/useRef'

export { useState } from './hooks/useState'
export { useReducer } from './hooks/useReducer'
export { useMemo } from './hooks/useMemo'
export { useCallback } from './hooks/useCallback'
export { useEffect } from './hooks/useEffect'
export { useLayoutEffect } from './hooks/useLayoutEffect'
export { useContext } from './hooks/useContext'
export { useId } from './hooks/useId'
export { useImperativeHandle } from './hooks/useImperativeHandle'
export { useSyncExternalStore } from './hooks/useSyncExternalStore'

// Documented no-ops — Tier 3 in the compatibility contract
export {
  useTransition,
  useDeferredValue,
  useInsertionEffect,
  useDebugValue,
} from './hooks/noop-hooks'

export { forwardRef, isForwardRef, FORWARD_REF } from './forwardRef'
export type { Ref, ForwardRefComponent } from './forwardRef'

export {
  createContext,
  withProvider,
  pushContext,
  popContext,
} from './context'
export type { Context } from './context'

export {
  createInstance,
  withInstance,
  getCurrentInstance,
  setCurrentInstance,
  flushLayoutEffects,
  flushPassiveEffects,
} from './instance'
export type { ComponentInstance, EffectEntry } from './instance'