---
name: git-rules
description: Mandatory rules for Git operations in BrightLocalWP.
---

# BrightLocalWP Git Rules

These rules apply to all work in this project.

## Standing permissions

- **Commit automatically**: every implemented and validated change must be
  committed without asking first. Commit messages must be in English.
- **Changelogs in English**: `CHANGELOG.md` entries, release notes and
  changelog summaries shown to the user must be in English.
- **Push only on request**: never push without the user explicitly asking
  for a push (naming the destination or approving it).

## Still requires explicit authorization

- `git push` (unless just requested);
- `git reset` or `git reset --hard`;
- `git checkout` or `git restore` to discard changes;
- `git clean`;
- `git branch -D`;
- merge, rebase, cherry-pick or history rewriting;
- worktree creation or removal;
- tag creation or deletion;
- any equivalent command that could discard work or alter the
  repository history.

## Operations always allowed

These may be run for inspection or validation, as long as they do not alter
history or discard files:

- `git status`;
- `git log`;
- `git diff`;
- `git show`;
- `git branch --list`;
- `git ls-files`.

Staging files (`git add`) is allowed as part of preparing the automatic
commit.

## Workflow for each change

1. implement and validate the code (`npm run lint`, `npm run check`,
   `npm run package`, plus relevant smoke tests);
2. stage and commit with an English message;
3. show the commit, the changed files and the checks performed;
4. wait for an explicit push request before pushing.
