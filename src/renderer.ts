import { resolve } from 'node:path';
import { ipcAsync } from '@getflywheel/local/renderer';

function ProjectScanner({ React }: { React: any }): any {
  const [state, setState] = React.useState({ loading: false, error: '', result: null as any });

  const scan = async () => {
    setState({ loading: true, error: '', result: null });
    try {
      const result = await ipcAsync('brightlocalwp:scan');
      setState({ loading: false, error: '', result });
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      });
    }
  };

  const result = state.result;
  const projects = Array.isArray(result?.projects) ? result.projects : [];
  const orphans = Array.isArray(result?.orphans) ? result.orphans : [];
  const roots = Array.isArray(result?.roots) ? result.roots : [];

  return React.createElement('div', { className: 'bright-local-wp-settings' },
    React.createElement('p', { className: 'bright-local-wp__description' },
      'Analise as pastas de projetos do Local e encontre ambientes que existem no disco, mas não estão listados na interface.',
    ),
    React.createElement('div', { className: 'bright-local-wp__notice' },
      'Modo seguro: a verificação é somente leitura. Nenhum arquivo será removido ou alterado.',
    ),
    React.createElement('button', {
      className: 'bright-local-wp__button',
      onClick: scan,
      disabled: state.loading,
    }, state.loading ? 'Verificando…' : 'Verificar projetos'),
    state.error && React.createElement('p', { className: 'bright-local-wp__error' }, state.error),
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
        projects.map((project: any) => React.createElement('li', { key: String(project.path) },
          React.createElement('span', { className: project.registeredProjectId ? 'is-registered' : 'is-candidate' },
            project.registeredProjectId ? 'Registrado' : project.looksLikeLocalProject ? 'Órfão candidato' : 'Ignorado',
          ),
          React.createElement('code', null, String(project.path)),
        )),
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
