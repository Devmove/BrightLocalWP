import { resolve } from 'node:path';
import { ipcAsync } from '@getflywheel/local/renderer';
import { Lang, resolveLanguage, translate } from './core/i18n';

interface PendingAction {
  kind: 'restore' | 'delete';
  projectPath: string;
  title: string;
  lines: string[];
  confirmLabel: string;
  danger: boolean;
}

type ListFilter = 'all' | 'registered' | 'orphan';
type ListSort = 'registered-first' | 'orphan-first' | 'name';

function projectStatus(project: any): 'registered' | 'orphan' | 'ignored' {
  if (project.registeredProjectId) return 'registered';
  if (project.looksLikeLocalProject) return 'orphan';
  return 'ignored';
}

function Spinner({ React }: { React: any }): any {
  return React.createElement('span', {
    className: 'bright-local-wp__spinner',
    'aria-hidden': 'true',
  });
}

function detectInitialLanguage(): Lang {
  try {
    const nav = (globalThis as any)?.navigator?.language;
    if (typeof nav === 'string' && nav.length > 0) return resolveLanguage(nav, 'pt');
  } catch {
    // Sem acesso ao navegador: mantém o padrão.
  }
  return 'pt';
}

function ProjectScanner({ React }: { React: any }): any {
  const [state, setState] = React.useState({
    loading: false,
    error: '',
    notice: '',
    restoringPath: '',
    deletingPath: '',
    pending: null as PendingAction | null,
    confirmPermanent: false,
    result: null as any,
    scanned: false,
    filter: 'all' as ListFilter,
    search: '',
    sort: 'registered-first' as ListSort,
    language: detectInitialLanguage(),
  });

  const lang = state.language as Lang;
  const tr = (key: string, vars: Record<string, string | number> = {}): string =>
    translate(lang, key, vars);

  if (typeof React.useEffect === 'function') {
    React.useEffect(() => {
      ipcAsync('brightlocalwp:get-language')
        .then((response: any) => {
          const language = resolveLanguage(response?.language, lang);
          setState((previous: any) => ({ ...previous, language }));
        })
        .catch(() => {
          // Mantém o idioma detectado localmente.
        });
    }, []);
  }

  const changeLanguage = async (value: string) => {
    const language = resolveLanguage(value, lang);
    setState((previous: any) => ({ ...previous, language }));
    try {
      await ipcAsync('brightlocalwp:set-language', { language });
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const runScan = async (options: { clearMessages?: boolean } = {}) => {
    const clear = options.clearMessages ?? false;
    setState((previous: any) => ({
      ...previous,
      loading: true,
      error: clear ? '' : previous.error,
      notice: clear ? '' : previous.notice,
    }));
    try {
      const result = await ipcAsync('brightlocalwp:scan');
      setState((previous: any) => ({ ...previous, loading: false, result, scanned: true }));
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const askRestore = async (project: any) => {
    const projectPath = String(project.path);
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null }));
    try {
      const preview = await ipcAsync('brightlocalwp:restore-preview', { path: projectPath });
      const evidence = preview.evidence ?? {};
      const sqlCount = Array.isArray(evidence.sqlDumps) ? evidence.sqlDumps.length : 0;
      setState((previous: any) => ({
        ...previous,
        pending: {
          kind: 'restore',
          projectPath,
          title: tr('confirm.restoreTitle'),
          lines: [
            tr('line.folder', { path: projectPath }),
            tr('line.nameDomain', { name: String(preview.name ?? ''), domain: String(preview.domain ?? '') }),
            tr('line.template', { template: String(preview.templateSiteName ?? preview.templateSiteId ?? '') }),
            tr('line.server', {
              server: String(evidence.webServer ?? '?'),
              php: evidence.phpHint ? tr('line.serverPhp', { php: String(evidence.phpHint) }) : '',
              wp: evidence.hasWpConfig ? tr('line.wpFound') : tr('line.wpMissing'),
              sql: sqlCount,
            }),
            tr('line.restoreAction'),
            tr('line.versionsNote'),
          ],
          confirmLabel: tr('confirm.restoreConfirm'),
          danger: false,
        } as PendingAction,
      }));
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const askDelete = async (project: any) => {
    const projectPath = String(project.path);
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null, confirmPermanent: false }));
    try {
      const preview = await ipcAsync('brightlocalwp:delete-preview', { path: projectPath });
      setState((previous: any) => ({
        ...previous,
        pending: {
          kind: 'delete',
          projectPath,
          title: tr('confirm.deleteTitle'),
          lines: [
            tr('line.folder', { path: projectPath }),
            tr('line.size', { size: String(preview.sizeText ?? '?') }),
            tr('line.trashInfo'),
          ],
          confirmLabel: tr('confirm.trash'),
          danger: true,
        } as PendingAction,
      }));
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const cancelPending = () => {
    setState((previous: any) => ({ ...previous, pending: null, confirmPermanent: false }));
  };

  const confirmPending = async () => {
    const pending = state.pending as PendingAction | null;
    if (!pending) return;
    if (pending.kind === 'restore') {
      await runRestore(pending.projectPath);
    } else {
      await runDelete(pending.projectPath);
    }
  };

  const runRestore = async (projectPath: string) => {
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null, restoringPath: projectPath }));
    try {
      const restored = await ipcAsync('brightlocalwp:restore', { path: projectPath });
      const warnings = Array.isArray(restored.warnings) ? restored.warnings : [];
      const status = restored.running
        ? tr('notice.restoreOk', {
          name: String(restored.site?.name ?? ''),
          domain: String(restored.site?.domain ?? ''),
          imported: restored.importedDump ? tr('notice.restoreImported') : '',
        })
        : tr('notice.restorePartial', {
          name: String(restored.site?.name ?? ''),
          domain: String(restored.site?.domain ?? ''),
        });
      setState((previous: any) => ({
        ...previous,
        restoringPath: '',
        notice: warnings.length > 0
          ? `${status} ${tr('notice.warnings', { warnings: warnings.join(' ') })}`
          : status,
      }));
      await runScan();
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        restoringPath: '',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const runDelete = async (projectPath: string) => {
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null, confirmPermanent: false, deletingPath: projectPath }));
    try {
      await ipcAsync('brightlocalwp:delete-orphan', { path: projectPath });
      setState((previous: any) => ({
        ...previous,
        deletingPath: '',
        notice: tr('notice.trashed', { path: projectPath }),
      }));
      await runScan();
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        deletingPath: '',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const runDeletePermanent = async (projectPath: string) => {
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null, confirmPermanent: false, deletingPath: projectPath }));
    try {
      await ipcAsync('brightlocalwp:delete-permanent', { path: projectPath });
      setState((previous: any) => ({
        ...previous,
        deletingPath: '',
        notice: tr('notice.deleted', { path: projectPath }),
      }));
      await runScan();
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        deletingPath: '',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const result = state.result;
  const projects = Array.isArray(result?.projects) ? result.projects : [];
  const orphans = Array.isArray(result?.orphans) ? result.orphans : [];
  const roots = Array.isArray(result?.roots) ? result.roots : [];
  const restoring = state.restoringPath !== '';
  const deleting = state.deletingPath !== '';
  const busy = state.loading || restoring || deleting;
  const pending = state.pending as PendingAction | null;
  const filter = state.filter as ListFilter;
  const search = String(state.search ?? '').trim().toLowerCase();
  const sort = state.sort as ListSort;

  const statusLabel = (status: string): string =>
    status === 'registered' ? tr('status.registered') : status === 'orphan' ? tr('status.orphan') : tr('status.ignored');

  const statusRank = (status: string): number => {
    if (sort === 'orphan-first') {
      return status === 'orphan' ? 0 : status === 'registered' ? 1 : 2;
    }
    return status === 'registered' ? 0 : status === 'orphan' ? 1 : 2;
  };

  const visibleProjects = projects
    .filter((project: any) => {
      const status = projectStatus(project);
      if (filter === 'registered' && status !== 'registered') return false;
      if (filter === 'orphan' && status !== 'orphan') return false;
      if (search) {
        const haystack = `${String(project.name ?? '')} ${String(project.path ?? '')}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a: any, b: any) => {
      if (sort === 'name') {
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), lang === 'pt' ? 'pt-BR' : 'en');
      }
      const rank = statusRank(projectStatus(a)) - statusRank(projectStatus(b));
      if (rank !== 0) return rank;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), lang === 'pt' ? 'pt-BR' : 'en');
    });

  const setFilter = (value: ListFilter) => {
    setState((previous: any) => ({ ...previous, filter: value }));
  };
  const setSearch = (value: string) => {
    setState((previous: any) => ({ ...previous, search: value }));
  };
  const setSort = (value: ListSort) => {
    setState((previous: any) => ({ ...previous, sort: value }));
  };

  const renderToolbar = () => {
    const filterButton = (value: ListFilter, label: string) =>
      React.createElement('button', {
        key: value,
        className: `bright-local-wp__filter-button${filter === value ? ' is-active' : ''}`,
        disabled: busy,
        onClick: () => setFilter(value),
      }, label);
    return React.createElement('div', { className: 'bright-local-wp__toolbar' },
      React.createElement('div', { className: 'bright-local-wp__filters', role: 'group', 'aria-label': tr('filter.label') },
        filterButton('all', tr('filter.all')),
        filterButton('registered', tr('filter.registered')),
        filterButton('orphan', tr('filter.orphan')),
      ),
      React.createElement('input', {
        className: 'bright-local-wp__search',
        type: 'search',
        placeholder: tr('search.placeholder'),
        value: state.search,
        disabled: busy,
        onChange: (event: any) => setSearch(event?.target?.value ?? ''),
        'aria-label': tr('search.label'),
      }),
      React.createElement('select', {
        className: 'bright-local-wp__sort',
        value: sort,
        disabled: busy,
        onChange: (event: any) => setSort(event?.target?.value ?? 'registered-first'),
        'aria-label': tr('sort.label'),
      },
        React.createElement('option', { value: 'registered-first' }, tr('sort.registeredFirst')),
        React.createElement('option', { value: 'orphan-first' }, tr('sort.orphanFirst')),
        React.createElement('option', { value: 'name' }, tr('sort.name')),
      ),
    );
  };

  const renderPendingBox = () => {
    if (!pending) return null;
    if (pending.kind === 'delete' && state.confirmPermanent) {
      return React.createElement('div', { className: 'bright-local-wp__confirm is-danger' },
        React.createElement('strong', null, tr('confirm.permanentTitle')),
        React.createElement('ul', null,
          React.createElement('li', null, tr('line.folder', { path: pending.projectPath })),
          React.createElement('li', null, tr('confirm.permanentInfo')),
        ),
        React.createElement('div', { className: 'bright-local-wp__confirm-actions' },
          React.createElement('button', {
            className: 'bright-local-wp__delete-button--solid',
            disabled: busy,
            onClick: () => runDeletePermanent(pending.projectPath),
          }, tr('confirm.removeFinal')),
          React.createElement('button', {
            className: 'bright-local-wp__cancel-button',
            disabled: busy,
            onClick: () => setState((previous: any) => ({ ...previous, confirmPermanent: false })),
          }, tr('action.back')),
        ),
      );
    }
    return React.createElement('div', { className: `bright-local-wp__confirm${pending.danger ? ' is-danger' : ''}` },
      React.createElement('strong', null, pending.title),
      React.createElement('ul', null,
        pending.lines.map((line: string, index: number) =>
          React.createElement('li', { key: index }, line),
        ),
      ),
      React.createElement('div', { className: 'bright-local-wp__confirm-actions' },
        React.createElement('button', {
          className: pending.danger ? 'bright-local-wp__delete-button' : 'bright-local-wp__button',
          disabled: busy,
          onClick: confirmPending,
        }, pending.confirmLabel),
        pending.kind === 'delete' && React.createElement('button', {
          className: 'bright-local-wp__delete-button--solid',
          disabled: busy,
          onClick: () => setState((previous: any) => ({ ...previous, confirmPermanent: true })),
        }, tr('confirm.permanent')),
        React.createElement('button', {
          className: 'bright-local-wp__cancel-button',
          disabled: busy,
          onClick: cancelPending,
        }, tr('action.cancel')),
      ),
    );
  };

  const scanLabel = state.loading
    ? tr('scan.loading')
    : state.scanned
      ? tr('scan.rescan')
      : tr('scan.start');

  return React.createElement('div', { className: 'bright-local-wp-settings' },
    React.createElement('div', { className: 'bright-local-wp__topbar' },
      React.createElement('span', null),
      React.createElement('label', { className: 'bright-local-wp__language' },
        tr('app.languageLabel'),
        React.createElement('select', {
          value: lang,
          disabled: busy,
          onChange: (event: any) => changeLanguage(event?.target?.value ?? lang),
          'aria-label': tr('app.languageLabel'),
        },
          React.createElement('option', { value: 'pt' }, 'Português'),
          React.createElement('option', { value: 'en' }, 'English'),
        ),
      ),
    ),
    React.createElement('p', { className: 'bright-local-wp__description' }, tr('app.description')),
    React.createElement('div', { className: 'bright-local-wp__notice' }, tr('app.safeNotice')),
    React.createElement('button', {
      className: 'bright-local-wp__button',
      onClick: () => runScan({ clearMessages: true }),
      disabled: busy,
    }, ...(state.loading ? [React.createElement(Spinner, { React, key: 'spinner' }), scanLabel] : [scanLabel])),
    state.error && React.createElement('p', { className: 'bright-local-wp__error' }, state.error),
    state.notice && React.createElement('p', { className: 'bright-local-wp__success' }, state.notice),
    result && React.createElement('div', { className: 'bright-local-wp__result' },
      React.createElement('p', null, tr('scan.summary', { projects: projects.length, orphans: orphans.length })),
      roots.length > 0 && React.createElement('details', null,
        React.createElement('summary', null, tr('scan.roots')),
        React.createElement('ul', { className: 'bright-local-wp__list' },
          roots.map((root: unknown) => React.createElement('li', { key: String(root) },
            React.createElement('code', null, String(root)),
          )),
        ),
      ),
      renderToolbar(),
      visibleProjects.length === 0 && React.createElement('p', { className: 'bright-local-wp__empty' }, tr('list.empty')),
      React.createElement('ul', { className: 'bright-local-wp__list' },
        visibleProjects.map((project: any) => {
          const status = projectStatus(project);
          const isOrphan = status === 'orphan';
          const isRestoring = state.restoringPath === String(project.path);
          const isDeleting = state.deletingPath === String(project.path);
          const showPendingHere = pending?.projectPath === String(project.path);
          const row = React.createElement('li', { key: String(project.path), className: 'bright-local-wp__row' },
            React.createElement('span', { className: project.registeredProjectId ? 'is-registered' : 'is-candidate' }, statusLabel(status)),
            React.createElement('code', null, String(project.path)),
            isOrphan && React.createElement('span', { className: 'bright-local-wp__actions' },
              React.createElement('button', {
                className: 'bright-local-wp__restore-button',
                disabled: busy,
                onClick: () => askRestore(project),
              }, ...(isRestoring ? [React.createElement(Spinner, { React, key: 'spinner' }), tr('action.restoring')] : [tr('action.restore')])),
              React.createElement('button', {
                className: 'bright-local-wp__delete-button',
                disabled: busy,
                onClick: () => askDelete(project),
              }, ...(isDeleting ? [React.createElement(Spinner, { React, key: 'spinner' }), tr('action.deleting')] : [tr('action.delete')])),
            ),
          );
          if (!showPendingHere) return row;
          return [
            row,
            React.createElement('li', {
              key: `${String(project.path)}:confirm`,
              className: 'bright-local-wp__confirm-row',
            }, renderPendingBox()),
          ];
        }),
      ),
    ),
  );
}

export default function renderer(context: any): void {
  const { React, hooks } = context;
  hooks.addContent('stylesheets', () => {
    const stylesheetPath = resolve(__dirname, '../style.css');
    return React.createElement('link', {
      rel: 'stylesheet',
      href: stylesheetPath,
      key: 'bright-local-wp-stylesheet',
    });
  });

  hooks.addFilter('preferencesMenuItems', (menu: any[]) => {
    menu.push({
      path: 'bright-local-wp',
      displayName: 'BrightLocalWP',
      sections: [
        {
          rows: [
            {
              name: 'Projetos órfãos',
              component: () => React.createElement(ProjectScanner, { React }),
            },
          ],
        },
      ],
    });
    return menu;
  });
}
