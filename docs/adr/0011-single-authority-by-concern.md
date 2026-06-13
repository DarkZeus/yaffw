# Single authority by concern

The rewrite should not pursue one global source of truth for every piece of application state. Each concern has its own authority: the editor session owns domain state and editing decisions, preview/player adapters own volatile playback facts, interaction components own transient pointer state, analysis services own analysis results until emitted, and resource adapters own disposable browser resources.

**Consequences**

- State that affects generated media belongs in the editor session.
- State that only affects rendering or interaction should stay near the component or adapter that needs it.
- A single broad app state object is not a valid replacement for clear ownership boundaries.
