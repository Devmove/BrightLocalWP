import { addIpcAsyncListener, getServiceContainer, sendIPCEvent } from '@getflywheel/local/main';
import { copyFile, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import { Lang, resolveLanguage, translate } from './core/i18n';
import { expandHomePath, findOrphanCandidates, scanProjects } from './core/project-scanner';

const SETTINGS_FILE = 'brightlocalwp-settings.json';

function defaultLanguage(context: any): Lang {
  try {
    const locale = context?.electron?.app?.getLocale?.();
    if (typeof locale === 'string' && locale.length > 0) {
      return resolveLanguage(locale, 'en');
    }
  } catch {
    // Sem acesso ao locale: usa o padrão abaixo.
  }
  return 'pt';
}

async function loadLanguage(context: any): Promise<Lang> {
  const userDataPath = resolveUserDataPath(context);
  if (!userDataPath) return defaultLanguage(context);
  try {
    const raw = await readFile(join(userDataPath, SETTINGS_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return resolveLanguage((parsed as Record<string, unknown>).language, defaultLanguage(context));
    }
  } catch {
    // Arquivo ausente ou inválido: usa o padrão.
  }
  return defaultLanguage(context);
}

async function saveLanguage(context: any, language: Lang): Promise<void> {
  const userDataPath = resolveUserDataPath(context);
  if (!userDataPath) throw new Error(translate(language, 'warn.noUserData'));
  await writeFile(join(userDataPath, SETTINGS_FILE), JSON.stringify({ language }, null, 2));
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

  addIpcAsyncListener('brightlocalwp:get-language', async () => ({
    language: await loadLanguage(context),
  }));

  addIpcAsyncListener('brightlocalwp:set-language', async (request: { language?: unknown }) => {
    const current = await loadLanguage(context);
    const language = resolveLanguage(request?.language, 'invalid' as Lang);
    if (language !== 'pt' && language !== 'en') {
      throw new Error(translate(current, 'err.invalidLanguage'));
    }
    await saveLanguage(context, language);
    return { language };
  });

  addIpcAsyncListener('brightlocalwp:restore-preview', async (request: RestoreRequest) => {
    const preview = await buildRestorePlan(siteData, request, await loadLanguage(context));
    const { siteJSON, ...rest } = preview;
    void siteJSON;
    return rest;
  });

  addIpcAsyncListener('brightlocalwp:restore', async (request: RestoreRequest) => {
    const lang = await loadLanguage(context);
    const plan = await buildRestorePlan(siteData, request, lang);

    let backupPath: string | null = null;
    let backupWarning: string | null = null;
    const userDataPath = resolveUserDataPath(context);
    if (userDataPath) {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = join(userDataPath, `sites.json.brightlocalwp-${stamp}.bak`);
        await copyFile(join(userDataPath, 'sites.json'), backupPath);
      } catch (error) {
        backupWarning = translate(lang, 'warn.backupFailed', { error: errMessage(error) });
      }
    } else {
      backupWarning = translate(lang, 'warn.noUserData');
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
        translate(lang, 'warn.groupFailed', { error: errMessage(error) }),
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
      const provision = await provisionRestoredSite(serviceContainer, siteData, plan.siteJSON.id, lang);
      running = true;
      datadirBackup = provision.datadirBackup;
      if (provision.datadirRepaired) {
        warnings.push(translate(lang, 'warn.datadirRepaired'));
      }
    } catch (error) {
      warnings.push(
        translate(lang, 'warn.provisionFailed', { error: errMessage(error) }),
      );
    }

    if (running) {
      const dumpPath = pickSqlDump(plan.evidence);
      if (dumpPath) {
        try {
          await importRestoredDatabase(serviceContainer, siteData, plan.siteJSON.id, dumpPath, lang);
          importedDump = dumpPath;
        } catch (error) {
          warnings.push(
            translate(lang, 'warn.importFailed', { error: errMessage(error) }),
          );
        }
      } else {
        warnings.push(translate(lang, 'warn.noDump'));
      }
    }

    let oldDomain: string | null = null;
    if (importedDump) {
      oldDomain = await detectOldDomain(importedDump);
    }
    if (oldDomain && oldDomain !== plan.siteJSON.domain.toLowerCase()) {
      warnings.push(
        translate(lang, 'warn.oldDomain', { old: oldDomain, domain: plan.siteJSON.domain }),
      );
    }

    // Finaliza a interface: primeiro navega até o site restaurado (como na
    // criação normal), aguarda a remontagem das visões e só então emite as
    // atualizações, para que a lista lateral seja remontada com dados frescos.
    if (running) {
      try {
        sendIPCEvent('goToRoute', `/main/site-info/${plan.siteJSON.id}`);
      } catch {
        // A navegação é conveniência; o site já está registrado e em execução.
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    // Garante que a interface do Local reflita o novo site e seu estado final.
    if (typeof siteData.emitSitesUpdate === 'function') {
      siteData.emitSitesUpdate();
    }
    try {
      serviceContainer.cradle.sitesOrganization.moveSitesToGroup(
        [plan.siteJSON.id],
        'default',
        true,
      );
    } catch {
      // A associação inicial já foi feita; isto é apenas uma atualização final.
    }
    try {
      sendIPCEvent('siteAdded', plan.siteJSON);
    } catch {
      // Evento informativo; a atualização principal já foi emitida acima.
    }

    if (running) {
      notify(
        'success',
        translate(lang, 'toast.restoreOk', { name: plan.siteJSON.name, domain: plan.siteJSON.domain }),
      );
    } else {
      notify(
        'error',
        translate(lang, 'toast.restoreFail', { name: plan.siteJSON.name }),
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
    const lang = await loadLanguage(context);
    const { candidatePath } = await assertOrphanCandidate(siteData, request?.path, lang);
    const size = await getDirectorySize(candidatePath);
    return { path: candidatePath, size, sizeText: formatBytes(size.bytes, lang) };
  });

  addIpcAsyncListener('brightlocalwp:delete-orphan', async (request: RestoreRequest) => {
    const lang = await loadLanguage(context);
    const { candidatePath } = await assertOrphanCandidate(siteData, request?.path, lang);
    const shell = context?.electron?.shell;
    if (!shell || typeof shell.trashItem !== 'function') {
      throw new Error(translate(lang, 'err.trashUnavailable'));
    }
    try {
      await shell.trashItem(candidatePath);
    } catch (error) {
      notify('error', translate(lang, 'toast.trashFail', { error: errMessage(error) }));
      throw error;
    }
    notify('success', translate(lang, 'toast.trashOk', { path: candidatePath }));
    return { path: candidatePath, trashed: true };
  });

  addIpcAsyncListener('brightlocalwp:delete-permanent', async (request: RestoreRequest) => {
    const lang = await loadLanguage(context);
    const { candidatePath } = await assertOrphanCandidate(siteData, request?.path, lang);
    try {
      await rm(candidatePath, { recursive: true, force: true });
    } catch (error) {
      notify('error', translate(lang, 'toast.permanentFail', { error: errMessage(error) }));
      throw error;
    }
    notify('success', translate(lang, 'toast.permanentOk', { path: candidatePath }));
    return { path: candidatePath, deleted: true };
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
  lang: Lang,
): Promise<{ candidatePath: string; roots: string[] }> {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new Error(translate(lang, 'err.invalidPath'));
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
    throw new Error(translate(lang, 'err.outsideRoot'));
  }
  const alreadyRegistered = registeredProjects.some(
    (project) => normalize(resolve(project.path)) === normalize(candidatePath),
  );
  if (alreadyRegistered) {
    throw new Error(translate(lang, 'err.registeredDelete'));
  }
  let children: string[];
  try {
    children = (await readdir(candidatePath, { withFileTypes: true })).map(
      (entry) => entry.name,
    );
  } catch {
    throw new Error(translate(lang, 'err.unreadable'));
  }
  if (!children.includes('app') || !children.includes('conf')) {
    throw new Error(translate(lang, 'err.noStructure'));
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
  lang: Lang,
): Promise<{ datadirRepaired: boolean; datadirBackup: string | null }> {
  const site = siteData.getSite(siteId);
  if (!site) throw new Error(translate(lang, 'err.noSiteAfterRegister'));
  const lightningServices = serviceContainer.cradle.lightningServices;
  if (!lightningServices) throw new Error(translate(lang, 'err.noLightning'));

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
  lang: Lang,
): Promise<void> {
  const site = siteData.getSite(siteId);
  if (!site) throw new Error(translate(lang, 'err.importNoSite'));
  const lightningServices = serviceContainer.cradle.lightningServices;
  const siteServices = lightningServices.getSiteServices(site);
  const dbService = siteServices.find((service: any) => service?.bin?.mysql);
  if (!dbService) throw new Error(translate(lang, 'err.noDbService'));

  await importSqlDump({
    mysqlBin: dbService.bin.mysql,
    configPath: dbService.configPath,
    dbName: site.mysql?.database ?? 'local',
    dumpPath,
    extraEnv: dbService.env ?? {},
  });
}

async function buildRestorePlan(siteData: any, request: RestoreRequest, lang: Lang): Promise<any> {
  const { candidatePath } = await assertOrphanCandidate(siteData, request?.path, lang);

  const registered = await getRegisteredSites(siteData);
  if (registered.length === 0) {
    throw new Error(translate(lang, 'err.noTemplate'));
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
    throw new Error(translate(lang, 'err.domainInUse', { domain }));
  }

  const usedPorts = collectUsedPorts(registered);
  const services = cloneServicesWithFreePorts(template.services ?? {}, usedPorts);
  const id = generateSiteId(registered.map((site) => site.id), lang);

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
