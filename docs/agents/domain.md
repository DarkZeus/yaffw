# Domain docs

YAFFW is a single-context repository. Engineering skills and implementation agents should use the repository's domain documentation as the source of names, relationships, and architectural constraints.

## Before exploring or implementing

- Read root `CONTEXT.md` completely.
- Read every record under `docs/adr/` that touches the area being changed.
- Read focused baseline documents under `docs/` when the work concerns their subject, such as browser export correctness or preview synchronization.
- If a referenced document does not exist, proceed without proposing documentation solely to satisfy this convention.

## Use the glossary's vocabulary

Use the terms defined in `CONTEXT.md` in issue titles, implementation, test names, and user-facing explanations. Do not drift to synonyms the glossary explicitly rejects.

If a required concept is absent from the glossary, first determine whether the implementation is inventing an unnecessary concept. If the concept is real and load-bearing, use the documentation workflow to define it.

## Respect recorded decisions

Do not silently contradict an ADR. If new evidence makes an existing decision harmful, identify the ADR explicitly and explain why it should be revised or superseded before implementing the conflicting direction.

Keep durable decisions in `CONTEXT.md`, ADRs, tests, or focused baseline documents rather than relying only on completed issue history.
