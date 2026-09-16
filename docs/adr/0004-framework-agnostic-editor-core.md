# Framework-agnostic editor core

The editor core should be plain TypeScript, with React hooks and components acting as adapters around it. This keeps domain concepts such as media asset, selection, media track, audio mix decision, and export job out of component state and makes the rewrite resistant to the hook-level entanglement present in the legacy editor.

**Consequences**

- Core state transitions should be testable without rendering React.
- Browser APIs may appear in core services where they are the actual processing primitive, but React-specific concerns stay outside the core.
- UI state such as dialogs, fullscreen, hover, and toast progress must not be stored in the domain model.
