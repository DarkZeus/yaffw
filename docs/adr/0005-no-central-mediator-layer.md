# No central mediator layer

The rewrite should not recreate the legacy `useVideoEditorMediator` and `createXManager(state, setState, refs)` pattern. Coordination should happen through an explicit editor session reducer, named command handlers, and route-level React adapters, so modules are organized around domain responsibilities rather than a generic mediator or manager abstraction.

**Consequences**

- A route-level composition hook may wire React to the core, but it must stay thin.
- Modules should be named for domain work such as loading media assets, analyzing tracks, and running export jobs.
- Shared mutable refs and broad state mutation should not be passed through generic managers.
