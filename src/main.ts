import { addIpcAsyncListener, getServiceContainer } from '@getflywheel/local/main';
import { dirname } from 'node:path';
import { findOrphanCandidates, scanProjects } from './core/project-scanner';

/** Registra a ponte segura entre a interface e o scanner no processo principal. */
export default function main(): void {
  const serviceContainer = getServiceContainer();
  const siteData = serviceContainer.cradle.siteData;

  addIpcAsyncListener('brightlocalwp:scan', async () => {
    const sites = siteData.getSites();
    const registeredProjects = Object.values(sites)
      .filter((site: any) => site && typeof site.id === 'string' && typeof site.path === 'string')
      .map((site: any) => ({
        id: site.id,
        path: site.path,
      }));
    const roots = [...new Set(registeredProjects.map((project) => dirname(project.path)))];
    const results = await Promise.all(
      roots.map(async (root) => ({
        root,
        projects: await scanProjects(root, registeredProjects),
      })),
    );
    const projects = results.flatMap((result) => result.projects);
    return { roots, projects, orphans: findOrphanCandidates(projects) };
  });
}
