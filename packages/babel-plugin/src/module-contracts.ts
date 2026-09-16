export type ImportedComponentContract = {
  props: string[]
  /** Operation-bearing array prop to its required direct JSX key property. */
  operationKeys?: Record<string, string>
}

export type ImportedModuleContract = {
  /** Named hook exports whose direct return value is reactive. */
  hooks?: string[]
  /** Named component exports and their accepted prop contracts. */
  components?: Record<string, string[] | ImportedComponentContract>
}

export type ModuleMetadata = {
  /** Contracts keyed by the import source exactly as written in this module. */
  imports?: Record<string, ImportedModuleContract>
  /** @deprecated Local-name contracts retained for existing integrations. */
  importedHooks?: string[]
  /** @deprecated Local-name contracts retained for existing integrations. */
  importedComponents?: Record<string, string[] | ImportedComponentContract>
  operationProps?: string[]
  /** Exported operation-bearing prop to its required direct JSX key property. */
  operationKeyProps?: Record<string, string>
}

export type ModuleContractManifest = {
  /** Absolute directory against which module keys are resolved. */
  root: string
  /** Exact root-relative module IDs, using forward slashes. */
  modules: Record<string, ModuleMetadata>
}

function normalized(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Validate and retain a build-tool module contract manifest. */
export function defineModuleContracts<T extends ModuleContractManifest>(manifest: T): T {
  const seen = new Set<string>()
  for (const key of Object.keys(manifest.modules)) {
    const clean = normalized(key).replace(/^\.\//, '')
    if (!clean || clean.startsWith('/') || clean === '..' || clean.startsWith('../')) {
      throw new Error(`runOnce: module contract key must be root-relative: ${key}`)
    }
    if (clean !== key) throw new Error(`runOnce: module contract key is not normalized: ${key}`)
    if (seen.has(clean)) throw new Error(`runOnce: duplicate module contract key: ${key}`)
    seen.add(clean)
  }
  return manifest
}

/** Resolve metadata by exact module identity. Query strings are ignored. */
export function resolveModuleMetadata(manifest: ModuleContractManifest, moduleId: string): ModuleMetadata {
  const root = normalized(manifest.root)
  const id = normalized(moduleId.split('?')[0])
  const prefix = `${root}/`
  if (!id.startsWith(prefix)) throw new Error(`runOnce: module is outside the contract root: ${moduleId}`)
  const relative = id.slice(prefix.length)
  const metadata = manifest.modules[relative]
  if (!metadata) throw new Error(`runOnce: no module contract for ${relative}`)
  return metadata
}
