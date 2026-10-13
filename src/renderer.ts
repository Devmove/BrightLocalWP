import { resolve } from 'node:path';
import { ipcRenderer } from 'electron';

function BrightLocalWPPanel({ React, site }: { React: any; site: any }): any {
  const [state, setState] = React.useState({ loading: false, error: '', result: null as any });
  const sitePath = typeof site?.path === 'string' ? site.path : '';
  const siteName = typeof site?.name === 'string' ? site.name : 'ambiente selecionado';

  const scan = async () => {
    if (!sitePath) {
      setState({
        loading: false,
        error: 'O Local não forneceu o caminho deste ambiente.',
        result: null,
      });
      return;
    }

    setState({ loading: true, error: '', result: null });
    try {
      const result = await ipcRenderer.invoke('brightlocalwp:scan', {
        root: sitePath,
      });
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
  const buttonLabel = state.loading ? 'Verificando…' : 'Verificar diretório';
  const children = [
    React.createElement('div', { className: 'bright-local-wp__header', key: 'header' },
      React.createElement('div', null,
        React.createElement('span', { className: 'bright-local-wp__eyebrow' }, 'BRIGHTLOCALWP'),
        React.createElement('h3', null, `Manutenção: ${siteName}`),
      ),
      React.createElement('button', {
        className: 'bright-local-wp__button',
        onClick: scan,
        disabled: state.loading || !sitePath,
      }, buttonLabel),
    ),
    React.createElement('p', { className: 'bright-local-wp__description', key: 'description' },
      'Verifique a estrutura deste ambiente e encontre diretórios que não aparecem no Local.',
    ),
    React.createElement('div', { className: 'bright-local-wp__notice', key: 'notice' },
      'Modo seguro: esta versão apenas lê os diretórios. Nenhum arquivo será removido.',
    ),
    state.error && React.createElement('p', { className: 'bright-local-wp__error', key: 'error' }, state.error),
    result && React.createElement('div', { className: 'bright-local-wp__result', key: 'result' },
      React.createElement('div', { className: 'bright-local-wp__metrics' },
        React.createElement('strong', null, String(result.projects.length)),
        React.createElement('span', null, 'diretórios candidatos'),
        React.createElement('strong', null, String(result.orphans.length)),
        React.createElement('span', null, 'órfãos detectados'),
      ),
      React.createElement('ul', { className: 'bright-local-wp__list' },
        result.projects.map((project: any) => React.createElement('li', { key: project.path },
          React.createElement('span', { className: project.registeredProjectId ? 'is-registered' : 'is-candidate' },
            project.registeredProjectId ? 'Registrado' : project.looksLikeLocalProject ? 'Candidato' : 'Ignorado',
          ),
          React.createElement('code', null, project.name),
        )),
      ),
    ),
  ].filter(Boolean);

  return React.createElement('section', { className: 'bright-local-wp' }, children);
}

export default function renderer(context: any): void {
  const { React, hooks } = context;
  hooks.addContent('stylesheets', () => {
    const path = resolve(__dirname, '../style.css');
    return React.createElement('link', {
      rel: 'stylesheet',
      href: path,
      key: 'bright-local-wp-stylesheet',
    });
  });

  hooks.addContent('SiteInfoOverview', (site: any) =>
    React.createElement(BrightLocalWPPanel, { React, site, key: 'bright-local-wp-panel' }),
  );
}
