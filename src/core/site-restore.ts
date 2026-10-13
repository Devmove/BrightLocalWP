import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createGunzip } from 'node:zlib';

export type WebServerKind = 'nginx' | 'apache' | 'unknown';

export interface OrphanEvidence {
  path: string;
  hasAppDir: boolean;
  hasConfDir: boolean;
  webRoot: string | null;
  hasWpConfig: boolean;
  sqlDumps: string[];
  webServer: WebServerKind;
  phpHint: string | null;
}

export interface RestoreSuggestion {
  name: string;
  domain: string;
}

/**
 * Analisa um diretório órfão sem alterar nada no filesystem.
 * Coleta apenas evidências para orientar uma restauração segura.
 */
export async function analyzeOrphan(projectPath: string): Promise<OrphanEvidence> {
  const children = await readdir(projectPath, { withFileTypes: true });
  const childNames = new Set(children.map((child) => child.name));
  const hasAppDir = childNames.has('app');
  const hasConfDir = childNames.has('conf');

  let webRoot: string | null = null;
  let hasWpConfig = false;
  let sqlDumps: string[] = [];
  if (hasAppDir) {
    const appChildren = await readdir(join(projectPath, 'app'), { withFileTypes: true });
    const appNames = new Set(appChildren.map((child) => child.name));
    if (appNames.has('public')) {
      webRoot = join(projectPath, 'app', 'public');
      const publicChildren = await readdir(webRoot, { withFileTypes: true });
      hasWpConfig = publicChildren.some((child) => child.name === 'wp-config.php');
    }
    if (appNames.has('sql')) {
      const sqlChildren = await readdir(join(projectPath, 'app', 'sql'), {
        withFileTypes: true,
      });
      sqlDumps = sqlChildren
        .filter((child) => child.isFile() && /\.sql(\.gz)?$/i.test(child.name))
        .map((child) => join(projectPath, 'app', 'sql', child.name))
        .sort();
    }
  }

  let webServer: WebServerKind = 'unknown';
  let phpHint: string | null = null;
  if (hasConfDir) {
    const confChildren = await readdir(join(projectPath, 'conf'), { withFileTypes: true });
    const confNames = confChildren.filter((child) => child.isDirectory()).map((child) => child.name);
    if (confNames.includes('nginx')) webServer = 'nginx';
    else if (confNames.includes('apache')) webServer = 'apache';
    const phpVersionDir = confNames.find((name) => /^php-.+/.test(name));
    if (phpVersionDir) phpHint = phpVersionDir.replace(/^php-/, '');
  }

  return {
    path: projectPath,
    hasAppDir,
    hasConfDir,
    webRoot,
    hasWpConfig,
    sqlDumps,
    webServer,
    phpHint,
  };
}

/** Gera um slug seguro para domínio a partir do nome do diretório. */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'site'
  );
}

export function suggestRestore(
  projectPath: string,
  existingDomains: readonly string[] = [],
): RestoreSuggestion {
  const name = basename(projectPath);
  const taken = new Set(existingDomains.map((domain) => domain.toLowerCase()));
  const base = `${slugify(name)}.local`;
  if (!taken.has(base)) return { name, domain: base };

  let counter = 2;
  while (taken.has(`${slugify(name)}-${counter}.local`)) counter += 1;
  return { name, domain: `${slugify(name)}-${counter}.local` };
}

/** Coleta todas as portas já usadas pelos sites registrados. */
export function collectUsedPorts(sites: readonly any[]): Set<number> {
  const used = new Set<number>();
  for (const site of sites) {
    const services = site?.services ?? {};
    for (const service of Object.values(services) as any[]) {
      const ports = service?.ports ?? {};
      for (const value of Object.values(ports)) {
        const list = Array.isArray(value) ? value : [value];
        for (const port of list) {
          if (typeof port === 'number' && Number.isInteger(port)) used.add(port);
        }
      }
    }
  }
  return used;
}

/**
 * Clona a estrutura de serviços do site modelo, atribuindo portas livres.
 * Nunca reutiliza portas já ocupadas por outros sites.
 */
export function cloneServicesWithFreePorts(
  templateServices: Record<string, any>,
  usedPorts: Set<number>,
): Record<string, any> {
  const used = new Set(usedPorts);
  let next = used.size > 0 ? Math.max(...used) + 1 : 10000;
  const clone: Record<string, any> = {};

  for (const [serviceName, service] of Object.entries(templateServices ?? {})) {
    const serviceClone = { ...(service as object) } as any;
    const ports = (service as any)?.ports ?? {};
    const portsClone: Record<string, any> = {};
    for (const [portName, value] of Object.entries(ports)) {
      const assign = (): number => {
        while (used.has(next)) next += 1;
        const assigned = next;
        next += 1;
        used.add(assigned);
        return assigned;
      };
      portsClone[portName] = Array.isArray(value)
        ? (value as unknown[]).map(() => assign())
        : assign();
    }
    serviceClone.ports = portsClone;
    clone[serviceName] = serviceClone;
  }
  return clone;
}

/** Gera um ID de site no formato usado pelo Local, sem colidir com os existentes. */
export function generateSiteId(existingIds: readonly string[] = []): string {
  const taken = new Set(existingIds);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomBytes(7).toString('base64url').slice(0, 9);
    if (!taken.has(id)) return id;
  }
  throw new Error('Não foi possível gerar um ID único para o site.');
}

/**
 * Escolhe o dump SQL a importar: prefere `local.sql` (convenção do Local),
 * senão o primeiro `*.sql` em ordem alfabética. Retorna null se não houver.
 */
export function pickSqlDump(evidence: OrphanEvidence): string | null {
  const dumps = evidence.sqlDumps.filter((dump) => /\.sql$/i.test(dump));
  if (dumps.length === 0) return null;
  const local = dumps.find((dump) => basename(dump).toLowerCase() === 'local.sql');
  return local ?? [...dumps].sort()[0];
}

/**
 * Detecta o domínio antigo gravado no dump (linha `siteurl` do wp_options).
 * Lê o arquivo em blocos para não carregar dumps grandes na memória.
 * Retorna null quando não encontrado.
 */
export async function detectOldDomain(dumpPath: string): Promise<string | null> {
  const pattern = /['"]siteurl['"]\s*,\s*['"](https?:\/\/([^'"/\s\\]+))/i;
  const chunkSize = 64 * 1024;
  const maxBytes = 25 * 1024 * 1024;
  const fileStream = createReadStream(dumpPath, { highWaterMark: chunkSize });
  const source: AsyncIterable<Buffer> =
    dumpPath.toLowerCase().endsWith('.gz')
      ? fileStream.pipe(createGunzip())
      : fileStream;

  let carry = '';
  let read = 0;
  try {
    for await (const chunk of source) {
      read += chunk.length;
      const text = carry + chunk.toString('utf8');
      const match = pattern.exec(text);
      if (match) return match[2].toLowerCase();
      carry = text.slice(-256);
      if (read >= maxBytes) break;
    }
  } catch {
    return null;
  }
  return null;
}

export interface SqlImportOptions {
  mysqlBin: string;
  configPath: string;
  dbName: string;
  dumpPath: string;
  extraEnv?: Record<string, string>;
}
/**
 * Importa um dump SQL para o banco usando o binário mysql do próprio Local.
 * Suporta dumps `.sql` e `.sql.gz`. Não altera o arquivo original.
 */
export async function importSqlDump(options: SqlImportOptions): Promise<void> {
  const { mysqlBin, configPath, dbName, dumpPath, extraEnv } = options;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(mysqlBin, [dbName], {
      env: { ...process.env, MYSQL_HOME: configPath, ...extraEnv },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });
    child.on('error', (error: Error) => rejectPromise(error));
    child.on('close', (code: number | null) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`mysql saiu com código ${code}: ${stderr.trim()}`));
    });

    const fileStream = createReadStream(dumpPath);
    fileStream.on('error', (error) => {
      child.kill();
      rejectPromise(error);
    });
    if (dumpPath.toLowerCase().endsWith('.gz')) {
      const gunzip = createGunzip();
      gunzip.on('error', (error) => {
        child.kill();
        rejectPromise(error);
      });
      fileStream.pipe(gunzip).pipe(child.stdin);
    } else {
      fileStream.pipe(child.stdin);
    }
  });
}

export interface DatadirSanity {
  repaired: boolean;
  backupPath: string | null;
}

/**
 * Verifica se um datadir do MySQL é válido (inicialização completa).
 * Um datadir parcial (ex.: inicialização interrompida por my.cnf ausente)
 * é movido para um backup lateral — nunca apagado — para que o provisionamento
 * possa recriá-lo. Um datadir válido jamais é tocado.
 */
export async function ensureFreshDatadir(dataPath: string): Promise<DatadirSanity> {
  let entries: string[];
  try {
    entries = await readdir(dataPath);
  } catch {
    return { repaired: false, backupPath: null };
  }
  if (entries.includes('ibdata1')) {
    return { repaired: false, backupPath: null };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let backupPath = `${dataPath}.brightlocalwp-broken-${stamp}`;
  let counter = 1;
  while (await pathExists(backupPath)) {
    counter += 1;
    backupPath = `${dataPath}.brightlocalwp-broken-${stamp}-${counter}`;
  }
  await rename(dataPath, backupPath);
  await mkdir(dataPath, { recursive: true });
  return { repaired: true, backupPath };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export interface DirectorySize {
  bytes: number;
  files: number;
}

/** Calcula o tamanho de um diretório de forma somente leitura. */
export async function getDirectorySize(root: string): Promise<DirectorySize> {
  let bytes = 0;
  let files = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files += 1;
        bytes += (await stat(full)).size;
      }
    }
  }
  return { bytes, files };
}

/** Formata bytes para exibição (ex.: 1,4 GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'tamanho desconhecido';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1).replace('.', ',')} ${units[unit]}`;
}
