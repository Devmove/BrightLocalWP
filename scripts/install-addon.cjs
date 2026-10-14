const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const configuredPath = packageJson.brightLocalWP?.localAddonPath;

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

async function copy(source, destination) {
  await fs.cp(path.join(root, source), path.join(destination, source), {
    recursive: true,
    force: true,
  });
}

async function main() {
  const configured = process.env.BRIGHTLOCALWP_ADDON_DIR || configuredPath;
  if (!configured) {
    throw new Error('Configure brightLocalWP.localAddonPath no package.json.');
  }

  const destination = path.resolve(expandHome(configured));
  if (destination === root) {
    throw new Error('O diretório do add-on não pode ser o diretório do projeto.');
  }

  await fs.mkdir(destination, { recursive: true });
  await Promise.all([
    copy('dist', destination),
    copy('package.json', destination),
    copy('LICENSE', destination),
    copy('README.md', destination),
    copy('style.css', destination),
    copy('icon.svg', destination),
  ]);

  console.log(`BrightLocalWP atualizado em: ${destination}`);
  console.log('Reinicie o Local se ele já estiver aberto para carregar o novo build.');
}

main().catch((error) => {
  console.error(`Erro ao atualizar o add-on: ${error.message}`);
  process.exitCode = 1;
});
