## Summary

What does this PR do? One or two sentences.

## Why

The motivating problem. Skip if the PR title already says it.

## Changes

- file/area 1: change
- file/area 2: change

## Test plan

- [ ] `npm test` passes (142+ green)
- [ ] `npm run build` clean
- [ ] Manual smoke test in browser if UI changed
- [ ] If a migration was added, server restart applied it on a real database

## Checklist

- [ ] Followed `WHERE user_id = ?` scoping on every new SQL query
- [ ] Parameterized SQL (no string interpolation)
- [ ] Added tests for new routes / utils / spend-calc behavior changes
- [ ] No secrets / API keys in the diff
- [ ] If schema changed, added a numbered migration (idempotent)
- [ ] If new modal/dialog: includes `useEscapeKey`, `aria-modal`, `aria-labelledby`
- [ ] If UI: works at mobile widths (sm: breakpoint)
- [ ] Updated relevant docs (`README.md` for user-facing; `DEVELOPMENT.md` for maintainer-facing)

## Screenshots (UI changes only)

Drag-and-drop here.

## Related

Closes #
