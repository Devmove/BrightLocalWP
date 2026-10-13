import { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, normalize, resolve, sep } from 'node:path';

export interface RegisteredProject {
  id: string;
  path: string;
}

export interface DiscoveredProject {
  name: string;
  path: string;
  /** Indica que o diretório possui a estrutura mínima esperada de um site Local. */
  looksLikeLocalProject: boolean;
  /** Preenchido quando o diretório também está registrado no Local. */
  registeredProjectId?: string;
}

export interface ProjectScannerOptions {
  /** Arquivos que caracterizam minimamente um projeto Local. */
  markers?: string[];
}

const DEFAULT_MARKERS = ['app', 'conf'];

/** Expande caminhos no formato `~/...` antes de normalizá-los. */
export function expandHomePath(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

/**
 * Localiza diretórios candidatos sem alterar o filesystem.
 *
 * A função recebe os projetos que o Local conhece para que a camada de integração
 * possa distinguir projetos ativos de diretórios órfãos. Nenhuma remoção é feita
 * aqui; operações destrutivas deverão exigir confirmação em uma camada posterior.
 */
export async function scanProjects(
  root: string,
  registeredProjects: readonly RegisteredProject[] = [],
  options: ProjectScannerOptions = {},
): Promise<DiscoveredProject[]> {
  const rootPath = resolve(expandHomePath(root));
  const markers = options.markers ?? DEFAULT_MARKERS;
  const registeredByPath = new Map(
    registeredProjects.map((project) => [
      normalize(resolve(expandHomePath(project.path))),
      project,
    ]),
  );
  const entries = await readdir(rootPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  return Promise.all(
    directories.map(async (entry) => {
      const path = join(rootPath, entry.name);
      const childEntries = await readdir(path, { withFileTypes: true });
      const childNames = new Set(childEntries.map((child) => child.name));
      const registered = registeredByPath.get(normalize(path));

      return {
        name: basename(path),
        path,
        looksLikeLocalProject: markers.every((marker) => childNames.has(marker)),
        ...(registered ? { registeredProjectId: registered.id } : {}),
      };
    }),
  );
}

/** Retorna apenas candidatos não registrados, sem classificar ou remover nada. */
export function findOrphanCandidates(
  projects: readonly DiscoveredProject[],
): DiscoveredProject[] {
  return projects.filter(
    (project) => project.looksLikeLocalProject && !project.registeredProjectId,
  );
}

/**
 * Verifica se um caminho está contido no diretório raiz permitido.
 * Isso será obrigatório antes de backup, restauração ou limpeza.
 */
export function isPathInside(root: string, candidate: string): boolean {
  const expandedRoot = expandHomePath(root);
  const expandedCandidate = expandHomePath(candidate);
  if (!isAbsolute(expandedRoot) || !isAbsolute(expandedCandidate)) return false;

  const normalizedRoot = normalize(resolve(expandedRoot));
  const normalizedCandidate = normalize(resolve(expandedCandidate));
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
}

export function isDirectoryEntry(entry: Dirent): boolean {
  return entry.isDirectory();
}
