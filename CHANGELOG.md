# Changelog

All notable changes to BrightLocalWP are documented in this file, in English.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-10-14

First usable release of the BrightLocalWP add-on for Local.

### Added

- Global orphan project scanner in Local preferences: compares on-disk
  directories with registered sites and lists them as Registered, Orphan
  candidate or Ignored.
- Project restore: re-registers an orphan with a free name/domain, clones
  service settings from a template site with free ports, provisions the MySQL
  datadir, starts services, sets the root password, creates the database,
  imports the original SQL dump, detects the legacy domain and navigates to
  the running site.
- Safe deletion: move to system trash (reversible) or permanent removal with
  two-step confirmation, with folder size shown upfront.
- Project list with status filters, name search and status/name sorting.
- Inline confirmations below the selected item; loading spinners on actions.
- Native success/error toasts on restore and delete completion.
- Portuguese/English internationalization with a panel selector, persisted
  language and CLI `--lang` flag.
- Read-only diagnostic CLI (`scan`, `analyze`).
- `BrightLocalWP-<version>.tar.gz` package build and `dev:install` command
  for local development installs.
- ESLint, TypeScript checks, GPL-3.0-or-later licensing and English-first
  documentation with a Brazilian Portuguese README translation.

### Fixed

- Expand `~` in paths before scanning (fixes `ENOENT ... '~/Local Sites'`).
- Compile service configs before MySQL datadir initialization (fixes
  `Failed to find valid data directory` on restored sites).
- Add restored sites to the default group with UI refresh so they show up
  without a manual window reload.
- Scope dark-mode styles to `html.Theme__Dark` for proper contrast.
