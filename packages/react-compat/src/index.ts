export { useRef } from './hooks/useRef.js'
export type { RefObject } from './hooks/useRef.js'

export { useState } from './hooks/useState.js'
export { useReducer } from './hooks/useReducer.js'
export { useMemo } from './hooks/useMemo.js'
export { useCallback } from './hooks/useCallback.js'
export { useEffect } from './hooks/useEffect.js'
export { useLayoutEffect } from './hooks/useLayoutEffect.js'
export { useContext } from './hooks/useContext.js'
export { useId } from './hooks/useId.js'
export { useImperativeHandle } from './hooks/useImperativeHandle.js'
export { useSyncExternalStore } from './hooks/useSyncExternalStore.js'

// Documented no-ops — Tier 3 in the compatibility contract
export {
  useTransition,
  useDeferredValue,
  useInsertionEffect,
  useDebugValue,
} from './hooks/noop-hooks.js'

export { forwardRef, isForwardRef, FORWARD_REF } from './forwardRef.js'
export type { Ref, ForwardRefComponent } from './forwardRef.js'

export {
  createContext,
  withProvider,
  pushContext,
  popContext,
  captureContext,
  withContextSnapshot,
} from './context.js'
export type { Context, ContextSnapshot } from './context.js'

export {
  createInstance,
  withInstance,
  getCurrentInstance,
  setCurrentInstance,
  flushLayoutEffects,
  flushPassiveEffects,
} from './instance.js'
export type { ComponentInstance, EffectEntry } from './instance.js'
export { derive } from './derive.js'
