# BrightLocalWP

Add-on for [Local](https://localwp.com) (Local by WP Engine) with maintenance
and cleanup tools for local WordPress environments.

## Features

- **Find orphan projects**: locate project folders that exist on disk but are
  not listed in the Local interface;
- **Restore projects**: re-register an orphan project in Local, with its
  database provisioned and imported, and start the site;
- **Safe deletion**: move the folder to the system trash or delete it
  permanently, always with confirmation;
- **Filtering, search and sorting** in the project list;
- **Portuguese and English**, with a selector in the panel itself.

## Requirements

- The Local app installed (macOS, Windows or Linux).

## Installation

1. Extract the `BrightLocalWP-<version>.tar.gz` package into Local's add-ons directory:
   - Linux: `~/.config/Local/addons/`
   - macOS: `~/Library/Application Support/Local/addons/`
   - Windows: `%APPDATA%\Local\addons\`
2. Restart Local.
3. Enable **BrightLocalWP** under *Settings > Add-ons*.

## Usage

Open Local's preferences and select **BrightLocalWP**.

### Scanning projects

Click **Scan projects** (afterwards, **Scan again**). The add-on analyzes the
folders where registered projects are stored and lists each directory as
**Registered**, **Orphan candidate** or **Ignored**. Use the status filters,
name search and sorting to navigate the list.

### Restoring an orphan project

Next to each orphan candidate, click **Restore** and confirm in the box that
appears below the item. The add-on suggests a name and domain, registers the
project, provisions the database (importing the original dump when available),
starts the site and navigates to it. Nothing is deleted or moved.

### Deleting an orphan project

Next to each orphan candidate, click **Delete** and confirm. You can **move to
trash** (reversible) or **delete permanently** (irreversible, with two-step
confirmation). The folder size is shown before confirmation.

### Language

The selector at the top of the panel switches between Portuguese and English.
The choice is saved and applies to the whole add-on.

### Command line (diagnostics)

```bash
node dist/cli.js scan "$HOME/Local Sites"
node dist/cli.js scan "$HOME/Local Sites" --registered projects.json --json
node dist/cli.js analyze "$HOME/Local Sites/my-site"
```

The CLI is read-only: it analyzes and reports without changing anything. Use
`--lang en` for English messages (default is Portuguese).

## Safety

- scanning is read-only;
- restore and delete require explicit confirmation in the panel;
- deletion defaults to trash; permanent removal warns that it is irreversible;
- automatic `sites.json` backups are created before each restore.

## Developer documentation

- [`docs/project-context.md`](docs/project-context.md): overview and current state;
- [`docs/architecture.md`](docs/architecture.md): modules, flows and Local integration;
- [`docs/development.md`](docs/development.md): environment, commands and checks.

## Translations

- [Português (Brasil)](docs/translations/README.pt-BR.md)
