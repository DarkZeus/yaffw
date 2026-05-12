# Editor core module shape

The first rewrite slice should introduce `src/editor-core/` for model, session, import, analysis, and export code, plus `src/editor-next/` for the React route and UI adapters. `editor-core` must not import from legacy components, routes, hooks, or API client modules; the dependency direction is from UI adapters into core.

**Consequences**

- Core model and state transitions can be tested without rendering the app.
- Legacy UI and server utilities can coexist without becoming hidden dependencies of the new core.
- The first directory shape is allowed to evolve, but dependency direction is not.
