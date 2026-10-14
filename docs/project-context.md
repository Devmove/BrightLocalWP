# Contexto do projeto BrightLocalWP

## Visão geral

O BrightLocalWP é um add-on para o Local (Local by WP Engine) voltado à
manutenção e à recuperação segura de ambientes WordPress locais.

Objetivos previstos:

- criar e gerenciar backups locais;
- localizar projetos existentes no disco que não aparecem no Local;
- identificar projetos órfãos;
- restaurar projetos órfãos na lista do Local;
- oferecer limpeza explícita, auditável e confirmada pelo usuário.

## Estado atual

O projeto possui:

- núcleo de descoberta em `src/core/project-scanner.ts`;
- CLI de diagnóstico em `src/cli.ts`;
- núcleo de restauração em `src/core/site-restore.ts` (análise do diretório,
  sugestão de nome/domínio, clonagem de serviços com portas livres,
  detecção do domínio antigo e importação do dump SQL com o binário do Local);
- entrada principal do add-on em `src/main.ts`, com os canais
  `brightlocalwp:scan`, `brightlocalwp:restore-preview` e `brightlocalwp:restore`;
- interface global nas preferências do Local em `src/renderer.ts`, com botão
  **Restaurar** ao lado de cada órfão candidato;
- comunicação entre renderer e processo principal usando `ipcAsync` e
  `addIpcAsyncListener`;
+- internacionalização em `src/core/i18n.ts` (PT/EN, 75 chaves), com o idioma
+  persistido em `brightlocalwp-settings.json` e seletor no topo do painel;
- build TypeScript;
- lint com ESLint;
- empacotamento em `build/BrightLocalWP-0.1.0.tar.gz`;
- comando de atualização local `npm run dev:install`.

A verificação de projetos órfãos é global. Ela não deve ser exibida dentro de
um projeto específico: deve analisar as raízes gerais onde os projetos do
Local estão armazenados, comparando diretórios encontrados no disco com os
projetos registrados pelo Local.

## Comandos principais

```bash
npm install
npm run lint
npm run check
npm run build
npm run package
npm run dev:install
```

O destino padrão de `npm run dev:install` é configurado em `package.json`:

```json
{
  "brightLocalWP": {
    "localAddonPath": "~/.config/Local/addons/bright-local-wp"
  }
}
```

Esse destino pode ser substituído com `BRIGHTLOCALWP_ADDON_DIR`.

## Princípios técnicos e de segurança

1. detectar antes de agir;
2. manter a descoberta separada da integração com a API do Local;
3. não apagar, mover ou alterar arquivos automaticamente;
4. validar caminhos antes de qualquer operação futura;
5. exigir confirmação explícita para operações destrutivas;
6. manter operações de backup, restauração e limpeza auditáveis.

## Política de Git

Nenhum `git commit`, `git push`, criação de branch, merge, reset ou outra
operação que altere o histórico deve ser executada sem autorização explícita
do usuário para aquela operação. A regra detalhada está em
`.opencode/skills/git-rules/SKILL.md`.
