import { resolve } from 'node:path';
import { ipcAsync } from '@getflywheel/local/renderer';

interface PendingAction {
  kind: 'restore' | 'delete';
  projectPath: string;
  title: string;
  lines: string[];
  confirmLabel: string;
  danger: boolean;
}

function Spinner({ React }: { React: any }): any {
  return React.createElement('span', {
    className: 'bright-local-wp__spinner',
    'aria-hidden': 'true',
  });
}

type ListFilter = 'all' | 'registered' | 'orphan';
type ListSort = 'registered-first' | 'orphan-first' | 'name';

function projectStatus(project: any): 'registered' | 'orphan' | 'ignored' {
  if (project.registeredProjectId) return 'registered';
  if (project.looksLikeLocalProject) return 'orphan';
  return 'ignored';
}

function ProjectScanner({ React }: { React: any }): any {
  const [state, setState] = React.useState({
    loading: false,
    error: '',
    notice: '',
    restoringPath: '',
    deletingPath: '',
    pending: null as PendingAction | null,
    result: null as any,
    scanned: false,
    filter: 'all' as ListFilter,
    search: '',
    sort: 'registered-first' as ListSort,
  });

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
          title: 'Restaurar projeto órfão?',
          lines: [
            `Pasta: ${projectPath}`,
            `Nome: ${preview.name} · Domínio: ${preview.domain}`,
            `Modelo de configuração: ${preview.templateSiteName ?? preview.templateSiteId}`,
            `Servidor: ${evidence.webServer ?? 'desconhecido'}${evidence.phpHint ? ` · PHP sugerido: ${evidence.phpHint}` : ''} · wp-config: ${evidence.hasWpConfig ? 'encontrado' : 'não encontrado'} · dumps SQL: ${sqlCount}`,
            'O projeto será registrado no Local, provisionado (banco de dados) e iniciado. Isso pode levar alguns minutos. Nenhum arquivo será apagado ou movido.',
          ],
          confirmLabel: 'Confirmar restauração',
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
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null }));
    try {
      const preview = await ipcAsync('brightlocalwp:delete-preview', { path: projectPath });
      setState((previous: any) => ({
        ...previous,
        pending: {
          kind: 'delete',
          projectPath,
          title: 'Excluir projeto órfão?',
          lines: [
            `Pasta: ${projectPath}`,
            `Tamanho: ${preview.sizeText ?? 'desconhecido'}`,
            'A pasta será movida para a lixeira do sistema (reversível). Nada será apagado definitivamente.',
          ],
          confirmLabel: 'Mover para a lixeira',
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
    setState((previous: any) => ({ ...previous, pending: null }));
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
        ? `Projeto "${restored.site.name}" restaurado e em execução como ${restored.site.domain}${restored.importedDump ? ' (banco importado)' : ''}. Abrindo o site…`
        : `Projeto "${restored.site.name}" registrado como ${restored.site.domain}, mas não está em execução.`;
      setState((previous: any) => ({
        ...previous,
        restoringPath: '',
        notice: warnings.length > 0 ? `${status} Atenção: ${warnings.join(' ')}` : status,
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
    setState((previous: any) => ({ ...previous, error: '', notice: '', pending: null, deletingPath: projectPath }));
    try {
      await ipcAsync('brightlocalwp:delete-orphan', { path: projectPath });
      setState((previous: any) => ({
        ...previous,
        deletingPath: '',
        notice: `Pasta movida para a lixeira: ${projectPath}`,
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
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR');
      }
      const rank = statusRank(projectStatus(a)) - statusRank(projectStatus(b));
      if (rank !== 0) return rank;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR');
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
      React.createElement('div', { className: 'bright-local-wp__filters', role: 'group', 'aria-label': 'Filtrar por status' },
        filterButton('all', 'Todos'),
        filterButton('registered', 'Registrados'),
        filterButton('orphan', 'Órfãos'),
      ),
      React.createElement('input', {
        className: 'bright-local-wp__search',
        type: 'search',
        placeholder: 'Buscar por nome…',
        value: state.search,
        disabled: busy,
        onChange: (event: any) => setSearch(event?.target?.value ?? ''),
        'aria-label': 'Buscar projeto por nome',
      }),
      React.createElement('select', {
        className: 'bright-local-wp__sort',
        value: sort,
        disabled: busy,
        onChange: (event: any) => setSort(event?.target?.value ?? 'registered-first'),
        'aria-label': 'Ordenar projetos',
      },
        React.createElement('option', { value: 'registered-first' }, 'Registrados primeiro'),
        React.createElement('option', { value: 'orphan-first' }, 'Órfãos primeiro'),
        React.createElement('option', { value: 'name' }, 'Nome (A–Z)'),
      ),
    );
  };

  const renderPendingBox = () => {
    if (!pending) return null;
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
        React.createElement('button', {
          className: 'bright-local-wp__cancel-button',
          disabled: busy,
          onClick: cancelPending,
        }, 'Cancelar'),
      ),
    );
  };

  const scanLabel = state.loading
    ? 'Verificando…'
    : state.scanned
      ? 'Buscar novamente'
      : 'Verificar projetos';

  return React.createElement('div', { className: 'bright-local-wp-settings' },
    React.createElement('p', { className: 'bright-local-wp__description' },
      'Analise as pastas de projetos do Local e encontre ambientes que existem no disco, mas não estão listados na interface.',
    ),
    React.createElement('div', { className: 'bright-local-wp__notice' },
      'Modo seguro: a verificação é somente leitura. A restauração registra e provisiona o projeto no Local; a exclusão move a pasta para a lixeira, sem apagar definitivamente.',
    ),
    React.createElement('button', {
      className: 'bright-local-wp__button',
      onClick: () => runScan({ clearMessages: true }),
      disabled: busy,
    }, ...(state.loading ? [React.createElement(Spinner, { React, key: 'spinner' }), scanLabel] : [scanLabel])),
    state.error && React.createElement('p', { className: 'bright-local-wp__error' }, state.error),
    state.notice && React.createElement('p', { className: 'bright-local-wp__success' }, state.notice),
    result && React.createElement('div', { className: 'bright-local-wp__result' },
      React.createElement('p', null, `${projects.length} diretório(s) encontrado(s), ${orphans.length} órfão(s) candidato(s).`),
      roots.length > 0 && React.createElement('details', null,
        React.createElement('summary', null, 'Diretórios analisados'),
        React.createElement('ul', { className: 'bright-local-wp__list' },
          roots.map((root: unknown) => React.createElement('li', { key: String(root) },
            React.createElement('code', null, String(root)),
          )),
        ),
      ),
      renderToolbar(),
      visibleProjects.length === 0 && React.createElement('p', { className: 'bright-local-wp__empty' },
        'Nenhum projeto corresponde ao filtro atual.',
      ),
      React.createElement('ul', { className: 'bright-local-wp__list' },
        visibleProjects.map((project: any) => {
          const isOrphan = project.looksLikeLocalProject && !project.registeredProjectId;
          const isRestoring = state.restoringPath === String(project.path);
          const isDeleting = state.deletingPath === String(project.path);
          const showPendingHere = pending?.projectPath === String(project.path);
          const row = React.createElement('li', { key: String(project.path), className: 'bright-local-wp__row' },
            React.createElement('span', { className: project.registeredProjectId ? 'is-registered' : 'is-candidate' },
              project.registeredProjectId ? 'Registrado' : project.looksLikeLocalProject ? 'Órfão candidato' : 'Ignorado',
            ),
            React.createElement('code', null, String(project.path)),
            isOrphan && React.createElement('span', { className: 'bright-local-wp__actions' },
              React.createElement('button', {
                className: 'bright-local-wp__restore-button',
                disabled: busy,
                onClick: () => askRestore(project),
              }, ...(isRestoring ? [React.createElement(Spinner, { React, key: 'spinner' }), 'Restaurando…'] : ['Restaurar'])),
              React.createElement('button', {
                className: 'bright-local-wp__delete-button',
                disabled: busy,
                onClick: () => askDelete(project),
              }, ...(isDeleting ? [React.createElement(Spinner, { React, key: 'spinner' }), 'Excluindo…'] : ['Excluir'])),
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
