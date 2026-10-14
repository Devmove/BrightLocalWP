# Architecture

## Modules

- `src/core/project-scanner.ts`: read-only discovery. `scanProjects`
  lists directories and compares them against registered projects;
  `findOrphanCandidates` filters orphans; `expandHomePath`/`isPathInside`
  handle `~` paths and validate root containment.
- `src/core/site-restore.ts`: restore logic with no dependency on the Local
  API. `analyzeOrphan` collects evidence (web server, `wp-config.php`,
  SQL dumps, PHP hint); `suggestRestore` proposes a free name/domain;
  `cloneServicesWithFreePorts` clones services with free ports;
  `pickSqlDump`/`detectOldDomain`/`importSqlDump` handle the database;
  `ensureFreshDatadir` moves partial datadirs to a sidecar backup (never
  deletes valid data); `getDirectorySize`/`formatBytes` support deletion.
- `src/core/i18n.ts`: PT/EN dictionaries, `translate`, `resolveLanguage`.
  Pure, with no filesystem access (usable in the renderer).
- `src/main.ts`: main-process entry. Uses `siteData`,
  `lightningServices`, `siteProcessManager`, `configTemplates` and
  `sitesOrganization` from Local's container.
- `src/renderer.ts`: global panel in preferences (`preferencesMenuItems`).
  Component with its own state machine (scan, inline pending, restore,
  delete) and built-in confirmations — without relying on Local's `confirm()`.
- `src/cli.ts`: terminal diagnostics (`scan`, `analyze`), with `--lang`.
- `scripts/package.cjs`: builds the tarball; `scripts/install-addon.cjs`:
  updates the local development install.

## IPC channels

| Channel | Direction | Effect |
|---|---|---|
| `brightlocalwp:scan` | renderer → main | Read-only scan of the roots |
| `brightlocalwp:restore-preview` | renderer → main | Restore plan without writing anything |
| `brightlocalwp:restore` | renderer → main | Registers, provisions, imports, starts and navigates |
| `brightlocalwp:delete-preview` | renderer → main | Folder size (read-only) |
| `brightlocalwp:delete-orphan` | renderer → main | Moves the folder to the trash |
| `brightlocalwp:delete-permanent` | renderer → main | Removes with `rm -rf` (irreversible) |
| `brightlocalwp:get-language` | renderer → main | Persisted language |
| `brightlocalwp:set-language` | renderer → main | Persists the language |

Events emitted to the Local UI: `refreshSites` (via `emitSitesUpdate`),
`refetchGroups` (via `moveSitesToGroup(..., true)`), `siteAdded`, `goToRoute`
and `showToast`.

## Restore flow

1. validates the candidate (`assertOrphanCandidate`: inside the roots, with
   `app/conf`, unregistered);
2. suggests a free name/domain and picks a template site with the same web
   server;
3. backs up `sites.json`;
4. `addSite` + `moveSitesToGroup(id, 'default', true)`;
5. `compileServiceConfigs` **before** `preprovision` (Local's official order;
   MySQL datadir initialization requires the compiled `my.cnf`);
6. partial-datadir sanitation, `preprovision`, `start`, `provision`
   (root password + `CREATE DATABASE local`);
7. dump import with Local's mysql binary;
8. legacy-domain detection (warns when it differs);
9. navigation to the site, waits for view remount, then emits the final UI
   update (`refreshSites` + `siteAdded`).

## Local integration details (found in the app's source)

- The site registry lives in `sites.json`; per-site runtime in
  `run/<id>/` (`mysql/data`, compiled `conf/*`, logs).
- The sidebar renders from the `siteGroups` GraphQL query (groups in
  `site-groups.json`); that is why restore adds the site to the default group
  with `refetchGroups`.
- The list query (`siteListSites`) is only fetched on screen mount; normal
  creation works around this by navigating to the new site (`goToRoute`) —
  restore does the same.
- Dark mode: Local applies the `Theme__Dark` class to the `<html>` element
  (not `body`); the add-on CSS uses variables with an override under
  `html.Theme__Dark`.
- Local's `confirm()` renders into `#popup-container` and never rejects on
  cancel; hence the add-on uses its own inline confirmations.
- Native toasts: `sendIPCEvent('showToast', { toastTrigger: 'import',
  toastType, message })`.

## Internationalization

Dictionary in `src/core/i18n.ts` (76 keys per language). The language is
persisted in `brightlocalwp-settings.json` in Local's data directory
(`get/set-language`); the initial default comes from the app locale, falling
back to PT. The CLI accepts `--lang pt|en`.
