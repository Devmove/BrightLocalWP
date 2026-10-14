---
name: git-rules
description: Mandatory rules for Git operations in BrightLocalWP.
---

# BrightLocalWP Git Rules

These rules apply to all work in this project.

## Main rule

Do not run `git commit` or `git push` without the user's explicit permission.
Commits are never automatic: every commit requires authorization, even for
small changes.

Also do not run without explicit authorization:
- `git reset` or `git reset --hard`;
- `git checkout` or `git restore` to discard changes;
- `git clean`;
- `git branch -D`;
- merge, rebase, cherry-pick or history rewriting;
- worktree creation or removal;
- tag creation or deletion;
- any equivalent command that could discard work or alter the
  repository history.

## Language conventions

- Commit messages must be in English.
- `CHANGELOG.md` entries, release notes and changelog summaries shown to
  the user must be in English.

## Operations always allowed

These may be run for inspection or validation, as long as they do not alter
history or discard files:

- `git status`;
- `git log`;
- `git diff`;
- `git show`;
- `git branch --list`;
- `git ls-files`.

Staging files (`git add`) also requires authorization when it is part of
preparing a commit. Without authorization, only inspect the changes and
inform the user.

## Workflow for each change

1. implement and validate the code (`npm run lint`, `npm run check`,
   `npm run package`, plus relevant smoke tests);
2. show the changed files and the checks performed;
3. inform that the changes have not been committed yet;
4. wait for specific authorization before creating a commit or pushing.

An authorization to implement a feature does not imply authorization
to commit or push.
