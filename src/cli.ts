import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  expandHomePath,
  findOrphanCandidates,
  RegisteredProject,
  scanProjects,
} from './core/project-scanner';
import { analyzeOrphan, suggestRestore } from './core/site-restore';

function printHelp(): void {
  console.log(`BrightLocalWP — diagnóstico de ambientes Local

Uso:
  brightlocalwp scan <diretório> [--registered <arquivo.json>] [--json]
  brightlocalwp analyze <diretório-do-projeto> [--json]

O arquivo de projetos registrados deve conter um array no formato:
  [{ "id": "site-id", "path": "/caminho/absoluto" }]

A varredura e a análise são somente leitura e não removem nem alteram arquivos.
`);
}

async function readRegisteredProjects(filePath?: string): Promise<RegisteredProject[]> {
  if (!filePath) return [];

  const content = await readFile(resolve(expandHomePath(filePath)), 'utf8');
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error('O arquivo de projetos registrados deve conter um array JSON.');
  }

  return parsed.map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).path !== 'string'
    ) {
      throw new Error(`Projeto registrado inválido na posição ${index}.`);
    }
    return item as RegisteredProject;
  });
}

async function scan(args: string[]): Promise<void> {
  const root = args[0];
  if (!root) throw new Error('Informe o diretório que deve ser verificado.');

  let registeredFile: string | undefined;
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--json') {
      json = true;
    } else if (args[index] === '--registered') {
      registeredFile = args[++index];
      if (!registeredFile) throw new Error('--registered exige um arquivo JSON.');
    } else {
      throw new Error(`Opção desconhecida: ${args[index]}`);
    }
  }

  const projects = await scanProjects(root, await readRegisteredProjects(registeredFile));
  const orphans = findOrphanCandidates(projects);

  if (json) {
    console.log(JSON.stringify({ root: resolve(root), projects, orphans }, null, 2));
    return;
  }

  console.log(`Diretório: ${resolve(root)}`);
  console.log(`Projetos candidatos: ${projects.length}`);
  console.log(`Órfãos detectados: ${orphans.length}`);
  for (const project of projects) {
    const status = project.registeredProjectId
      ? `registrado (${project.registeredProjectId})`
      : project.looksLikeLocalProject
        ? 'órfão candidato'
        : 'estrutura não reconhecida';
    console.log(`- ${project.name}: ${status} — ${project.path}`);
  }
}

async function analyze(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) throw new Error('Informe o diretório do projeto a ser analisado.');
  const json = args.includes('--json');

  const projectPath = resolve(expandHomePath(target));
  const evidence = await analyzeOrphan(projectPath);
  const suggestion = suggestRestore(projectPath);

  if (json) {
    console.log(JSON.stringify({ evidence, suggestion }, null, 2));
    return;
  }

  console.log(`Projeto: ${projectPath}`);
  console.log(`Estrutura app/conf: ${evidence.hasAppDir && evidence.hasConfDir ? 'sim' : 'não'}`);
  console.log(`Servidor web: ${evidence.webServer}`);
  console.log(`Pista de PHP: ${evidence.phpHint ?? 'não identificada'}`);
  console.log(`wp-config.php: ${evidence.hasWpConfig ? 'encontrado' : 'não encontrado'}`);
  console.log(`Dumps SQL: ${evidence.sqlDumps.length}`);
  for (const dump of evidence.sqlDumps) console.log(`- ${dump}`);
  console.log(`Nome sugerido: ${suggestion.name}`);
  console.log(`Domínio sugerido: ${suggestion.domain}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === 'scan') {
    await scan(args);
    return;
  }
  if (command === 'analyze') {
    await analyze(args);
    return;
  }
  throw new Error(`Comando desconhecido: ${command}`);
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
