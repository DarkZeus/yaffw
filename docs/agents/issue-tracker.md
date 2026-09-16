# Issue tracker: GitHub

GitHub Issues in `DarkZeus/yaffw` is the default issue tracker for this repository.

Prefer the GitHub connector when it is available. Otherwise use the authenticated `gh` CLI from inside this repository so it infers the repository from `git remote -v`.

## Conventions

- A request to create, add, publish, or fetch a ticket means a GitHub issue unless the user explicitly names another tracker.
- Create an issue with `gh issue create --title "..." --body "..."` and use a file or heredoc for multiline bodies.
- Read an issue with `gh issue view <number> --comments`, including its full body, comments, and labels before acting.
- List issues with `gh issue list --state open --json number,title,body,labels,comments` and appropriate state or label filters.
- Comment with `gh issue comment <number> --body "..."`.
- Apply or remove labels with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Do not close or modify a parent issue unless the user explicitly requests it.

## Skill language

- When a skill says "publish to the issue tracker," create a GitHub issue.
- When a skill says "fetch the relevant ticket," read the full GitHub issue and its comments.
