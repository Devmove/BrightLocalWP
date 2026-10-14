# Development

Guide for anyone developing or validating BrightLocalWP. For the architectural
context, see [`architecture.md`](architecture.md); for the overview,
[`project-context.md`](project-context.md).

## Prerequisites

- Node.js >= 18;
- npm;
- the Local app installed (to test the add-on for real).

## Commands

```bash
npm install        # install dependencies
npm run lint       # ESLint (must pass with no errors)
npm run check      # TypeScript type checking
npm run build      # compile to dist/
npm run package    # compile and build build/BrightLocalWP-<version>.tar.gz
npm run dev:install # compile and update the locally installed add-on
```

## Local install for testing (`dev:install`)

The default target is configured in `package.json`:

```json
{
  "brightLocalWP": {
    "localAddonPath": "~/.config/Local/addons/bright-local-wp"
  }
}
```

To use another directory without changing the file:

```bash
BRIGHTLOCALWP_ADDON_DIR="/other/directory/addons/bright-local-wp" npm run dev:install
```

The command copies `dist`, `package.json`, `README.md`, `style.css` and `icon.svg`.
Restart Local after updating to reload the add-on.

## Checks before calling it done

```bash
npm run lint && npm run check && npm run package && git diff --check
```

## Tests

No test framework is configured. Validation is done with:

- `npm run lint` and `npm run check` (static);
- Node smoke tests with stubs (scanner/restore core, IPC event ordering,
  panel state machine, i18n dictionaries);
- CLI against temporary or real directories (read-only);
- manual testing in Local after `npm run dev:install`.

Examples of smoke tests used during development are described in the commit
history; when adding new flows, prefer covering them with an equivalent Node
script before validating in Local.

## Git policy

No `git commit`, `git push`, branch creation, merge, reset or any other
history-changing operation may be executed without the user's explicit
authorization for that operation. The detailed rule lives in
`.opencode/skills/git-rules/SKILL.md`.
