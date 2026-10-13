import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  findOrphanCandidates,
  RegisteredProject,
  scanProjects,
} from './core/project-scanner';

function printHelp(): void {
  console.log(`BrightLocalWP — diagnóstico de ambientes Local

Uso:
  brightlocalwp scan <diretório> [--registered <arquivo.json>] [--json]

O arquivo de projetos registrados deve conter um array no formato:
  [{ "id": "site-id", "path": "/caminho/absoluto" }]

A varredura é somente leitura e não remove nem altera arquivos.
`);
}

async function readRegisteredProjects(filePath?: string): Promise<RegisteredProject[]> {
  if (!filePath) return [];

  const content = await readFile(resolve(filePath), 'utf8');
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

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command !== 'scan') throw new Error(`Comando desconhecido: ${command}`);
  await scan(args);
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
