# BrightLocalWP Project Context

## Overview

BrightLocalWP is an add-on for Local (Local by WP Engine) focused on safe
maintenance and recovery of local WordPress environments.

Planned goals:

- create and manage local backups;
- locate projects that exist on disk but do not show up in Local;
- identify orphan projects;
- restore orphan projects into Local's list;
- offer explicit, auditable cleanup confirmed by the user.

## Current state

The project contains:

- discovery core in `src/core/project-scanner.ts`;
- diagnostic CLI in `src/cli.ts`;
- restore core in `src/core/site-restore.ts` (directory analysis,
  name/domain suggestion, service cloning with free ports,
  legacy-domain detection and SQL dump import with Local's binary);
- main add-on entry in `src/main.ts`, with channels
  `brightlocalwp:scan`, `brightlocalwp:restore-preview`, `brightlocalwp:restore`,
  `brightlocalwp:delete-preview`, `brightlocalwp:delete-orphan`,
  `brightlocalwp:delete-permanent`, `brightlocalwp:get-language` and
  `brightlocalwp:set-language`;
- global interface in Local preferences in `src/renderer.ts`, with a
  filterable/sortable list and **Restore** and **Delete** buttons per orphan
  candidate;
- renderer/main communication using `ipcAsync` and `addIpcAsyncListener`;
- internationalization in `src/core/i18n.ts` (PT/EN), with the language
  persisted in `brightlocalwp-settings.json` and a selector at the top of the panel;
- TypeScript build;
- ESLint linting;
- packaging into `build/BrightLocalWP-0.1.0.tar.gz`;
- local update command `npm run dev:install`.

Orphan project scanning is global. It must not be shown inside a specific
project: it must analyze the general roots where Local projects are stored,
comparing directories found on disk with the projects registered by Local.

## Related documents

- [`architecture.md`](architecture.md): modules, IPC channels, flows and
  Local integration details;
- [`development.md`](development.md): environment, commands, checks and
  Git policy.

## Technical and safety principles

1. detect before acting;
2. keep discovery separate from Local API integration;
3. never delete, move or change files automatically;
4. validate paths before any future operation;
5. require explicit confirmation for destructive operations;
6. keep backup, restore and cleanup operations auditable.
