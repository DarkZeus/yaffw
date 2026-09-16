# Parallel route and editor core boundary

**Status:** Superseded by [ADR-0020](./0020-promote-editor-next-in-two-steps.md) after the parallel route proved the editor-next architecture and the two-step root cutover completed. The explicit editor-core dependency boundary remains current through [ADR-0008](./0008-editor-core-module-shape.md).

The rewrite should live behind a parallel editor route and an explicit core module boundary instead of replacing the existing editor in place. The new route may reuse generic UI atoms, but it should not depend on the legacy mediator, local file wrapper, or server-trim API because those are the patterns being replaced.

**Consequences**

- The old editor can remain usable while the new model is proven.
- New core concepts can be named directly without compatibility pressure from legacy names.
- Migration happens by moving capabilities into the new route, not by gradually reshaping the legacy state tree.
