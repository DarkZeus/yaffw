# Editor session reducer with command handlers

The editor core should use an explicit typed reducer for session state transitions and separate command handlers for asynchronous work. The reducer owns states such as empty, loading asset, ready, exporting, and failed, while commands load media, analyze tracks, run export jobs, and emit events back into the reducer.

**Consequences**

- Impossible editor states should be prevented by the session state type rather than guarded throughout components.
- The reducer must not run browser decoding, API calls, toasts, DOM ref logic, or component behavior.
- Command handlers must be named for concrete domain work, not for generic manager roles.
