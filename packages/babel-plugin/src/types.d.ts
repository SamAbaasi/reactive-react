declare module '@babel/plugin-syntax-jsx'
declare module '@babel/helper-module-imports' {
  import type { NodePath } from '@babel/core'
  import type { Identifier } from '@babel/types'
  export function addNamed(
    path: NodePath,
    name: string,
    source: string,
    opts?: object
  ): Identifier
}