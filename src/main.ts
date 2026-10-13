import { getServiceContainer } from '@getflywheel/local/main';
import { dirname } from 'node:path';
import { findOrphanCandidates, scanProjects } from './core/project-scanner';

interface ScanRequest {
  root: string;
}

/** Registra a ponte segura entre a interface e o scanner no processo principal. */
export default function main(context: any): void {
  const { ipcMain } = context.electron;
  const serviceContainer = getServiceContainer();
  const siteData = serviceContainer.cradle.siteData;

  ipcMain.handle('brightlocalwp:scan', async (_event: unknown, request: ScanRequest) => {
    if (!request || typeof request.root !== 'string') {
      throw new Error('Diretório de varredura inválido.');
    }

    const sites = siteData.getSites();
    const registeredProjects = Object.values(sites)
      .filter((site: any) => site && typeof site.id === 'string' && typeof site.path === 'string')
      .map((site: any) => ({
        id: site.id,
        path: site.path,
      }));
    const projects = await scanProjects(dirname(request.root), registeredProjects);
    return { projects, orphans: findOrphanCandidates(projects) };
  });
}
