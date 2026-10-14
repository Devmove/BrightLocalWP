import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  expandHomePath,
  findOrphanCandidates,
  RegisteredProject,
  scanProjects,
} from './core/project-scanner';
import { analyzeOrphan, suggestRestore } from './core/site-restore';
import { Lang, resolveLanguage, translate } from './core/i18n';

function extractLang(args: string[]): { lang: Lang; rest: string[] } {
  let lang: Lang = 'pt';
  const rest: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--lang') {
      const value = args[++index];
      lang = resolveLanguage(value, 'pt');
    } else {
      rest.push(args[index]);
    }
  }
  return { lang, rest };
}

function printHelp(lang: Lang): void {
  console.log(translate(lang, 'cli.help'));
}

async function readRegisteredProjects(filePath: string | undefined, lang: Lang): Promise<RegisteredProject[]> {
  if (!filePath) return [];

  const content = await readFile(resolve(expandHomePath(filePath)), 'utf8');
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(translate(lang, 'cli.errNotArray'));
  }

  return parsed.map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).path !== 'string'
    ) {
      throw new Error(translate(lang, 'cli.errInvalidEntry', { index }));
    }
    return item as RegisteredProject;
  });
}

async function scan(args: string[], lang: Lang): Promise<void> {
  const root = args[0];
  if (!root) throw new Error(translate(lang, 'cli.errNoDir'));

  let registeredFile: string | undefined;
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--json') {
      json = true;
    } else if (args[index] === '--registered') {
      registeredFile = args[++index];
      if (!registeredFile) throw new Error(translate(lang, 'cli.errRegisteredFlag'));
    } else {
      throw new Error(translate(lang, 'cli.errUnknownOption', { option: args[index] }));
    }
  }

  const t = (key: string, vars: Record<string, string | number> = {}): string =>
    translate(lang, key, vars);
  const projects = await scanProjects(root, await readRegisteredProjects(registeredFile, lang));
  const orphans = findOrphanCandidates(projects);

  if (json) {
    console.log(JSON.stringify({ root: resolve(root), projects, orphans }, null, 2));
    return;
  }

  console.log(t('cli.scanDir', { dir: resolve(root) }));
  console.log(t('cli.scanCandidates', { count: projects.length }));
  console.log(t('cli.scanOrphans', { count: orphans.length }));
  for (const project of projects) {
    const status = project.registeredProjectId
      ? t('cli.statusRegistered', { id: project.registeredProjectId })
      : project.looksLikeLocalProject
        ? t('cli.statusOrphan')
        : t('cli.statusUnknown');
    console.log(`- ${project.name}: ${status} — ${project.path}`);
  }
}

async function analyze(args: string[], lang: Lang): Promise<void> {
  const filtered = args.filter((arg) => arg !== '--json');
  const target = filtered[0];
  if (!target) throw new Error(translate(lang, 'cli.errNoTarget'));
  const json = args.includes('--json');

  const t = (key: string, vars: Record<string, string | number> = {}): string =>
    translate(lang, key, vars);
  const projectPath = resolve(expandHomePath(target));
  const evidence = await analyzeOrphan(projectPath);
  const suggestion = suggestRestore(projectPath);

  if (json) {
    console.log(JSON.stringify({ evidence, suggestion }, null, 2));
    return;
  }

  console.log(t('cli.analyzeProject', { path: projectPath }));
  console.log(t('cli.analyzeStructure', {
    value: evidence.hasAppDir && evidence.hasConfDir ? t('cli.yes') : t('cli.no'),
  }));
  console.log(t('cli.analyzeServer', { server: evidence.webServer }));
  console.log(t('cli.analyzePhp', { php: evidence.phpHint ?? t('cli.analyzePhpUnknown') }));
  console.log(t('cli.analyzeWp', {
    value: evidence.hasWpConfig ? t('cli.analyzeWpFound') : t('cli.analyzeWpMissing'),
  }));
  console.log(t('cli.analyzeDumps', { count: evidence.sqlDumps.length }));
  for (const dump of evidence.sqlDumps) console.log(`- ${dump}`);
  console.log(t('cli.analyzeName', { name: suggestion.name }));
  console.log(t('cli.analyzeDomain', { domain: suggestion.domain }));
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);
  const { lang, rest } = extractLang(rawArgs);
  if (!command || command === '--help' || command === '-h') {
    printHelp(lang);
    return;
  }
  try {
    if (command === 'scan') {
      await scan(rest, lang);
      return;
    }
    if (command === 'analyze') {
      await analyze(rest, lang);
      return;
    }
    throw new Error(translate(lang, 'cli.errUnknownCommand', { command }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(translate(lang, 'cli.errorPrefix', { error: error.message }));
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
