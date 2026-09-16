# Changelog

## Unreleased

### Runtime

- Settle derived signal values before observable effects and cancel queued disposed subscriptions.
- Preserve reactive child positions across conditional removal, replacement, and reinsertion.
- Render nested child arrays and normalize component fragment/text-array returns.
- Dispose renderer-created bindings during unmount and keyed-row removal.
- Deliver layout effects after DOM insertion and preserve shared-root lifecycle ownership.
- Update retained object rows, including during append operations.
- Map onDoubleClick to dblclick and update live input value/checked properties.

### Compiler and packaging

- Track getter/helper calls used as JSX children.
- Preserve map callback statements and index/source parameters by retaining native map execution when the keyed optimization cannot represent them.
- Inject required runtime imports with configurable importSource and classic-runtime support.
- Emit Node-resolvable ESM imports and package exports.
- Select the signal example entry before Vite resolves the production module graph.

### Compatibility

These changes do not provide general drop-in React compatibility. Ordinary state values, derived control flow, effect dependencies, context, type signatures, and broader DOM semantics still need work. See docs/COMPAT.md and docs/DEFECTS.md.

The working package versions are renderer 0.1.8, babel-plugin 0.1.2, react-compat 0.1.1, and signals 0.1.3. This work has not been published.
