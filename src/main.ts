import { addIpcAsyncListener, getServiceContainer, sendIPCEvent } from '@getflywheel/local/main';
import { copyFile, readdir } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import {
  analyzeOrphan,
  cloneServicesWithFreePorts,
  collectUsedPorts,
  detectOldDomain,
  ensureFreshDatadir,
  formatBytes,
  generateSiteId,
  getDirectorySize,
  importSqlDump,
  pickSqlDump,
  suggestRestore,
} from './core/site-restore';
import { expandHomePath, findOrphanCandidates, scanProjects } from './core/project-scanner';

interface RestoreRequest {
  path: string;
  name?: string;
  domain?: string;
}

function toSiteJSON(site: any): any {
  if (site && typeof site.toJSON === 'function') return site.toJSON();
  return { ...site };
}

/**
 * Exibe um toast nativo do Local. Usado na conclusão de operações longas
 * (restore/exclusão), quando o usuário pode já ter saído do painel.
 * Nunca interrompe o fluxo principal.
 */
function notify(kind: 'success' | 'error', message: string): void {
  try {
    sendIPCEvent('showToast', {
      toastTrigger: 'import',
      toastType: kind,
      message,
    });
  } catch {
    // Toast é informativo; o resultado já é exibido no painel do add-on.
  }
}

async function getRegisteredSites(siteData: any): Promise<any[]> {
  const sites = siteData.getSites();
  return (Object.values(sites) as any[])
    .filter((site: any) => site && typeof site.id === 'string' && typeof site.path === 'string')
    .map((site: any) => {
      const json = toSiteJSON(site);
      return { ...json, id: site.id, path: expandHomePath(site.path ?? json.path) };
    });
}

function resolveUserDataPath(context: any): string | null {
  const fromEnvironment = context?.environment?.userDataPath;
  if (typeof fromEnvironment === 'string' && fromEnvironment.length > 0) return fromEnvironment;
  try {
    const fromElectron = context?.electron?.app?.getPath('userData');
    if (typeof fromElectron === 'string' && fromElectron.length > 0) return fromElectron;
  } catch {
    // Sem acesso ao caminho: o backup será ignorado, mas a operação segue auditável na resposta.
  }
  return null;
}

/** Registra a ponte segura entre a interface e o scanner no processo principal. */
export default function main(context?: any): void {
  const serviceContainer = getServiceContainer();
  const siteData = serviceContainer.cradle.siteData;

  addIpcAsyncListener('brightlocalwp:scan', async () => {
    const registered = await getRegisteredSites(siteData);
    const registeredProjects = registered.map((site) => ({ id: site.id, path: site.path }));
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

  addIpcAsyncListener('brightlocalwp:restore-preview', async (request: RestoreRequest) => {
    const preview = await buildRestorePlan(siteData, request);
    const { siteJSON, ...rest } = preview;
    void siteJSON;
    return rest;
  });

  addIpcAsyncListener('brightlocalwp:restore', async (request: RestoreRequest) => {
    const plan = await buildRestorePlan(siteData, request);

    let backupPath: string | null = null;
    let backupWarning: string | null = null;
    const userDataPath = resolveUserDataPath(context);
    if (userDataPath) {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = join(userDataPath, `sites.json.brightlocalwp-${stamp}.bak`);
        await copyFile(join(userDataPath, 'sites.json'), backupPath);
      } catch (error) {
        backupWarning = `Não foi possível criar backup de sites.json: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      backupWarning = 'Caminho de dados do Local indisponível; backup automático ignorado.';
    }

    siteData.addSite(plan.siteJSON.id, plan.siteJSON);
    const warnings: string[] = [];
    if (backupWarning) warnings.push(backupWarning);
    // Coloca o site no grupo padrão e avisa a interface para recarregar a
    // lista (a barra lateral renderiza a partir dos grupos, não do registro).
    try {
      serviceContainer.cradle.sitesOrganization.moveSitesToGroup(
        [plan.siteJSON.id],
        'default',
        true,
      );
    } catch (error) {
      warnings.push(
        `Site registrado, mas não foi possível adicioná-lo ao grupo padrão: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof siteData.emitSitesUpdate === 'function') {
      siteData.emitSitesUpdate();
    }

    // Provisiona o runtime do novo site (mesma sequência do Local ao criar um
    // site): inicializa o datadir do MySQL, inicia os serviços, define a senha
    // do root, cria o banco e importa o dump SQL do projeto original.
    let running = false;
    let importedDump: string | null = null;
    let datadirBackup: string | null = null;
    try {
      const provision = await provisionRestoredSite(serviceContainer, siteData, plan.siteJSON.id);
      running = true;
      datadirBackup = provision.datadirBackup;
      if (provision.datadirRepaired) {
        warnings.push(
          'Um datadir parcial de tentativa anterior foi preservado em backup e recriado do zero.',
        );
      }
    } catch (error) {
      warnings.push(
        `Falha ao provisionar/executar o site: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (running) {
      const dumpPath = pickSqlDump(plan.evidence);
      if (dumpPath) {
        try {
          await importRestoredDatabase(serviceContainer, siteData, plan.siteJSON.id, dumpPath);
          importedDump = dumpPath;
        } catch (error) {
          warnings.push(
            `Banco criado, mas a importação do dump falhou: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        warnings.push('Nenhum dump SQL encontrado em app/sql; o banco foi criado vazio.');
      }
    }

    let oldDomain: string | null = null;
    if (importedDump) {
      oldDomain = await detectOldDomain(importedDump);
    }
    if (oldDomain && oldDomain !== plan.siteJSON.domain.toLowerCase()) {
      warnings.push(
        `O banco referencia o domínio antigo ${oldDomain}; o site agora usa ${plan.siteJSON.domain}. Ajuste os endereços no WordPress se necessário.`,
      );
    }

    // Garante que a interface do Local reflita o novo site e seu estado final.
    if (typeof siteData.emitSitesUpdate === 'function') {
      siteData.emitSitesUpdate();
    }
    try {
      sendIPCEvent('siteAdded', plan.siteJSON);
    } catch {
      // Evento informativo; a atualização principal já foi emitida acima.
    }

    if (running) {
      notify(
        'success',
        `Projeto "${plan.siteJSON.name}" restaurado e em execução como ${plan.siteJSON.domain}.`,
      );
    } else {
      notify(
        'error',
        `Projeto "${plan.siteJSON.name}" registrado, mas não entrou em execução. Verifique o painel do BrightLocalWP.`,
      );
    }

    return {
      site: {
        id: plan.siteJSON.id,
        name: plan.siteJSON.name,
        domain: plan.siteJSON.domain,
        path: plan.siteJSON.path,
      },
      templateSiteName: plan.templateSiteName,
      backupPath,
      running,
      importedDump,
      oldDomain,
      datadirBackup,
      warnings,
      evidence: plan.evidence,
    };
  });

  addIpcAsyncListener('brightlocalwp:delete-preview', async (request: RestoreRequest) => {
    const { candidatePath } = await assertOrphanCandidate(siteData, request?.path);
    const size = await getDirectorySize(candidatePath);
    return { path: candidatePath, size, sizeText: formatBytes(size.bytes) };
  });

  addIpcAsyncListener('brightlocalwp:delete-orphan', async (request: RestoreRequest) => {
    const { candidatePath } = await assertOrphanCandidate(siteData, request?.path);
    const shell = context?.electron?.shell;
    if (!shell || typeof shell.trashItem !== 'function') {
      throw new Error('Recurso de lixeira indisponível neste ambiente.');
    }
    try {
      await shell.trashItem(candidatePath);
    } catch (error) {
      notify(
        'error',
        `Não foi possível mover a pasta para a lixeira: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    notify('success', `Pasta movida para a lixeira: ${candidatePath}`);
    return { path: candidatePath, trashed: true };
  });
}

/**
 * Valida que um caminho é um órfão candidato: dentro das raízes de sites,
 * com estrutura mínima e sem registro no Local. Usado pelo restore e pela
 * exclusão segura (que move para a lixeira, sem apagar definitivamente).
 */
async function assertOrphanCandidate(
  siteData: any,
  rawPath: unknown,
): Promise<{ candidatePath: string; roots: string[] }> {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new Error('Caminho do projeto inválido.');
  }
  const candidatePath = resolve(expandHomePath(rawPath));
  const registered = await getRegisteredSites(siteData);
  const registeredProjects = registered.map((site) => ({ id: site.id, path: site.path }));
  const roots = [...new Set(registeredProjects.map((project) => dirname(project.path)))];
  const insideAllowedRoot = roots.some((root) => {
    const normalizedRoot = normalize(root);
    return (
      candidatePath === normalizedRoot || candidatePath.startsWith(`${normalizedRoot}/`)
    );
  });
  if (!insideAllowedRoot) {
    throw new Error('O projeto está fora dos diretórios de sites do Local.');
  }
  const alreadyRegistered = registeredProjects.some(
    (project) => normalize(resolve(project.path)) === normalize(candidatePath),
  );
  if (alreadyRegistered) {
    throw new Error('Este projeto está registrado no Local.');
  }
  let children: string[];
  try {
    children = (await readdir(candidatePath, { withFileTypes: true })).map(
      (entry) => entry.name,
    );
  } catch {
    throw new Error('Não foi possível ler o diretório do projeto.');
  }
  if (!children.includes('app') || !children.includes('conf')) {
    throw new Error('O diretório não possui a estrutura mínima de um site Local (app/conf).');
  }
  return { candidatePath, roots };
}

/**
 * Replica a sequência de provisionamento do Local para um site recém-registrado:
 * compila os configs ANTES do `preprovision` (a inicialização do datadir do
 * MySQL exige o my.cnf compilado), inicia os serviços e roda o `provision`
 * (senha do root + criação do banco).
 */
async function provisionRestoredSite(
  serviceContainer: any,
  siteData: any,
  siteId: string,
): Promise<{ datadirRepaired: boolean; datadirBackup: string | null }> {
  const site = siteData.getSite(siteId);
  if (!site) throw new Error('Site não encontrado após o registro.');
  const lightningServices = serviceContainer.cradle.lightningServices;
  if (!lightningServices) throw new Error('Serviços do Local indisponíveis.');

  await serviceContainer.cradle.configTemplates.compileServiceConfigs(site);

  const siteServices = lightningServices.getSiteServices(site);
  let datadirRepaired = false;
  let datadirBackup: string | null = null;
  const dbService = siteServices.find((service: any) => service?.bin?.mysql);
  const dataPath =
    dbService?.dataPath ?? join(site.paths?.runData ?? '', 'mysql', 'data');
  if (dataPath) {
    const sanity = await ensureFreshDatadir(dataPath);
    datadirRepaired = sanity.repaired;
    datadirBackup = sanity.backupPath;
  }

  for (const service of siteServices) {
    if (service && typeof service.preprovision === 'function') {
      await service.preprovision();
    }
  }
  await serviceContainer.cradle.siteProcessManager.start(site);
  for (const service of siteServices) {
    if (service && typeof service.provision === 'function') {
      await service.provision();
    }
  }
  return { datadirRepaired, datadirBackup };
}

/** Importa o dump SQL do projeto original para o banco recém-criado. */
async function importRestoredDatabase(
  serviceContainer: any,
  siteData: any,
  siteId: string,
  dumpPath: string,
): Promise<void> {
  const site = siteData.getSite(siteId);
  if (!site) throw new Error('Site não encontrado para importação do banco.');
  const lightningServices = serviceContainer.cradle.lightningServices;
  const siteServices = lightningServices.getSiteServices(site);
  const dbService = siteServices.find((service: any) => service?.bin?.mysql);
  if (!dbService) throw new Error('Serviço de banco de dados não encontrado.');

  await importSqlDump({
    mysqlBin: dbService.bin.mysql,
    configPath: dbService.configPath,
    dbName: site.mysql?.database ?? 'local',
    dumpPath,
    extraEnv: dbService.env ?? {},
  });
}

async function buildRestorePlan(siteData: any, request: RestoreRequest): Promise<any> {
  const { candidatePath } = await assertOrphanCandidate(siteData, request?.path);

  const registered = await getRegisteredSites(siteData);
  if (registered.length === 0) {
    throw new Error('Nenhum site registrado para usar como modelo de configuração.');
  }

  const evidence = await analyzeOrphan(candidatePath);
  const template =
    registered.find((site) => {
      const services = site.services ?? {};
      if (evidence.webServer === 'nginx') return 'nginx' in services;
      if (evidence.webServer === 'apache') return 'apache' in services;
      return false;
    }) ?? registered[0];

  const existingDomains = registered
    .map((site) => site.domain)
    .filter((domain): domain is string => typeof domain === 'string');
  const suggestion = suggestRestore(candidatePath, existingDomains);
  const name =
    typeof request.name === 'string' && request.name.trim().length > 0
      ? request.name.trim()
      : suggestion.name;
  const domain =
    typeof request.domain === 'string' && request.domain.trim().length > 0
      ? request.domain.trim()
      : suggestion.domain;
  if (existingDomains.map((item) => item.toLowerCase()).includes(domain.toLowerCase())) {
    throw new Error(`O domínio ${domain} já está em uso por outro site.`);
  }

  const usedPorts = collectUsedPorts(registered);
  const services = cloneServicesWithFreePorts(template.services ?? {}, usedPorts);
  const id = generateSiteId(registered.map((site) => site.id));

  const siteJSON = {
    id,
    name,
    path: candidatePath,
    domain,
    localVersion: template.localVersion,
    environment: template.environment,
    mysql: template.mysql,
    services,
    ports: {},
    workspace: template.workspace ?? null,
    multiSite: template.multiSite ?? '',
    xdebugEnabled: template.xdebugEnabled ?? false,
  };

  return {
    evidence,
    suggestedName: suggestion.name,
    suggestedDomain: suggestion.domain,
    name,
    domain,
    templateSiteId: template.id,
    templateSiteName: template.name,
    siteJSON,
  };
}
