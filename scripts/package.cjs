const fs = require('node:fs/promises');
const path = require('node:path');
const tar = require('tar');

const root = path.resolve(__dirname, '..');

async function main() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(root, 'package.json'), 'utf8'),
  );
  const outputDir = path.join(root, 'build');
  const archiveName = `${packageJson.productName}-${packageJson.version}.tar.gz`;
  await fs.mkdir(outputDir, { recursive: true });
  const output = path.join(outputDir, archiveName);
  await fs.rm(output, { force: true });

  await tar.create(
    {
      cwd: root,
      file: output,
      gzip: true,
      portable: true,
      prefix: packageJson.productName,
    },
    ['README.md', 'package.json', 'dist'],
  );
  console.log(`Pacote criado: ${path.relative(root, output)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
