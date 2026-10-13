import { resolve } from 'node:path';
import { confirm, ipcAsync } from '@getflywheel/local/renderer';

function ProjectScanner({ React }: { React: any }): any {
  const [state, setState] = React.useState({
    loading: false,
    error: '',
    notice: '',
    restoringPath: '',
    deletingPath: '',
    result: null as any,
  });

  const runScan = async () => {
    setState((previous: any) => ({ ...previous, loading: true, error: '', notice: '' }));
    try {
      const result = await ipcAsync('brightlocalwp:scan');
      setState((previous: any) => ({ ...previous, loading: false, result }));
    } catch (error) {
      setState((previous: any) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const restoreProject = async (project: any) => {
    const projectPath = String(project.path);
    setState((previous: any) => ({ ...previous, error: '', notice: '', restoringPath: projectPath }));
    try {
      const preview = await ipcAsync('brightlocalwp:restore-preview', { path: projectPath });
      const evidence = preview.evidence ?? {};
      const sqlCount = Array.isArray(evidence.sqlDumps) ? evidence.sqlDumps.length : 0;
      const details = [
        `Pasta: ${projectPath}`,
        `Nome: ${preview.name} · Domínio: ${preview.domain}`,
        `Modelo de configuração: ${preview.templateSiteName ?? preview.templateSiteId}`,
        `Servidor: ${evidence.webServer ?? 'desconhecido'}${evidence.phpHint ? ` · PHP sugerido: ${evidence.phpHint}` : ''} · wp-config: ${evidence.hasWpConfig ? 'encontrado' : 'não encontrado'} · dumps SQL: ${sqlCount}`,
      ].join('\n');

      try {
        await confirm({
          title: 'Restaurar projeto órfão?',
          message: `O projeto será registrado no Local, provisionado (banco de dados) e iniciado. O dump SQL será importado quando disponível. Nenhum arquivo será apagado ou movido. Isso pode levar alguns minutos.\n\n${details}\n\nAs versões de serviços são copiadas do site modelo e podem precisar de ajuste.`,
          buttonText: 'Restaurar projeto',
          cancelButtonText: 'Cancelar',
          buttonClass: '',
          topIcon: null,
          topIconColor: 'Green',
          largeConfirmButtonText: '',
          showBottomHr: false,
        });
      } catch {
        setState((previous: any) => ({ ...previous, restoringPath: '' }));
        return;
      }

      const restored = await ipcAsync('brightlocalwp:restore', { path: projectPath });
      const warnings = Array.isArray(restored.warnings) ? restored.warnings : [];
      const status = restored.running
        ? `Projeto "${restored.site.name}" restaurado e em execução como ${restored.site.domain}${restored.importedDump ? ' (banco importado)' : ''}.`
        : `Projeto "${restored.site.name}" registrado como ${restored.site.domain}, mas não está em execução.`;
      setState((previous: any) => ({
        ...previous,
        restoringPath: '',
        notice: warnings.length > 0 ? `${status} Atenção: ${warnings.join(' ')}` : `${status} Se não aparecer na lista, reinicie o Local.`,
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

  const deleteProject = async (project: any) => {
    const projectPath = String(project.path);
    setState((previous: any) => ({ ...previous, error: '', notice: '', deletingPath: projectPath }));
    try {
      const preview = await ipcAsync('brightlocalwp:delete-preview', { path: projectPath });
      try {
        await confirm({
          title: 'Excluir projeto órfão?',
          message: `A pasta será movida para a lixeira do sistema (reversível). Nada será apagado definitivamente.\n\nPasta: ${projectPath}\nTamanho: ${preview.sizeText ?? 'desconhecido'}`,
          buttonText: 'Mover para a lixeira',
          cancelButtonText: 'Cancelar',
          buttonClass: '',
          topIcon: null,
          topIconColor: 'Red',
          largeConfirmButtonText: '',
          showBottomHr: false,
        });
      } catch {
        setState((previous: any) => ({ ...previous, deletingPath: '' }));
        return;
      }

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

  return React.createElement('div', { className: 'bright-local-wp-settings' },
    React.createElement('p', { className: 'bright-local-wp__description' },
      'Analise as pastas de projetos do Local e encontre ambientes que existem no disco, mas não estão listados na interface.',
    ),
    React.createElement('div', { className: 'bright-local-wp__notice' },
      'Modo seguro: a verificação é somente leitura. A restauração registra e provisiona o projeto no Local; a exclusão move a pasta para a lixeira, sem apagar definitivamente.',
    ),
    React.createElement('button', {
      className: 'bright-local-wp__button',
      onClick: runScan,
      disabled: busy,
    }, state.loading ? 'Verificando…' : 'Verificar projetos'),
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
      React.createElement('ul', { className: 'bright-local-wp__list' },
        projects.map((project: any) => {
          const isOrphan = project.looksLikeLocalProject && !project.registeredProjectId;
          const isRestoring = state.restoringPath === String(project.path);
          const isDeleting = state.deletingPath === String(project.path);
          return React.createElement('li', { key: String(project.path), className: 'bright-local-wp__row' },
            React.createElement('span', { className: project.registeredProjectId ? 'is-registered' : 'is-candidate' },
              project.registeredProjectId ? 'Registrado' : project.looksLikeLocalProject ? 'Órfão candidato' : 'Ignorado',
            ),
            React.createElement('code', null, String(project.path)),
            isOrphan && React.createElement('span', { className: 'bright-local-wp__actions' },
              React.createElement('button', {
                className: 'bright-local-wp__restore-button',
                disabled: busy,
                onClick: () => restoreProject(project),
              }, isRestoring ? 'Restaurando…' : 'Restaurar'),
              React.createElement('button', {
                className: 'bright-local-wp__delete-button',
                disabled: busy,
                onClick: () => deleteProject(project),
              }, isDeleting ? 'Excluindo…' : 'Excluir'),
            ),
          );
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
