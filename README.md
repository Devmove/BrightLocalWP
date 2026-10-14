# BrightLocalWP

Add-on para o Local com ferramentas de manutenção e limpeza de ambientes WordPress.

> **Importante:** alterações Git não são commitadas nem enviadas automaticamente.
> Commits, pushes e operações que alteram o histórico exigem autorização explícita.

Consulte [`docs/project-context.md`](docs/project-context.md) para o contexto
arquitetural e as regras de desenvolvimento.

## Objetivos

- criar e gerenciar backups locais de ambientes;
- localizar projetos que existem no disco, mas não aparecem no Local;
- identificar projetos órfãos com segurança;
- restaurar projetos detectados no diretório do Local;
- oferecer limpeza explícita, auditável e sempre precedida por confirmação.

## Estado atual

O primeiro incremento contém o núcleo de descoberta (`src/core/project-scanner.ts`).
Ele apenas lê diretórios e compara candidatos com uma lista de projetos registrados.
Não há exclusão, movimentação ou alteração de arquivos.

## Desenvolvimento

```bash
npm install
npm run check
npm run build
```

## Uso da primeira versão

Após o build, a ferramenta de diagnóstico pode ser executada diretamente:

```bash
node dist/cli.js scan "$HOME/Local Sites"
node dist/cli.js scan "$HOME/Local Sites" --registered projetos.json --json
```

Para gerar o pacote instalável:

```bash
npm run package
```

O arquivo será criado em `build/BrightLocalWP-0.1.0.tar.gz`. Ele contém os
arquivos compilados e pode ser extraído no diretório de add-ons do Local.

## Atualização rápida durante o desenvolvimento

O comando abaixo compila e atualiza diretamente o add-on instalado localmente:

```bash
npm run dev:install
```

Por padrão, o destino é configurado em `package.json` como
`~/.config/Local/addons/bright-local-wp`. Para usar outro diretório sem alterar o
arquivo:

```bash
BRIGHTLOCALWP_ADDON_DIR="/outro/diretorio/addons/bright-local-wp" npm run dev:install
```

Reinicie o Local após a atualização para recarregar o add-on.

O add-on segue a estrutura de entradas `main` e `renderer` esperada pelo Local e usa
a API do add-on para obter os sites registrados e comunicar-se com o scanner.

## Interface no Local

Depois de extrair o pacote no diretório de add-ons do Local e reiniciar o aplicativo,
ative **BrightLocalWP** em *Settings > Add-ons*. Depois, abra a tela de
preferências do Local e selecione **BrightLocalWP**. O botão **Verificar projetos**
analisa as pastas onde os projetos registrados estão armazenados e lista projetos
registrados, candidatos órfãos e diretórios ignorados. A ferramenta é global e não
fica vinculada a um site específico.

## Restauração de projetos órfãos

Ao lado de cada órfão candidato há um botão **Restaurar**. O fluxo é:

1. o add-on analisa o diretório (servidor web, `wp-config.php`, dumps SQL);
2. sugere nome e domínio livre e escolhe um site registrado com o mesmo
   servidor web como modelo de configuração;
3. exibe tudo para confirmação explícita em caixa inline no próprio painel;
4. cria backup de `sites.json`, registra o projeto com portas livres e
   atualiza a lista de sites;
5. provisiona o runtime como o Local faz ao criar um site: compila os configs,
   saneia datadir parcial (movido para backup lateral, nunca apagado),
   inicializa o datadir do MySQL, inicia os serviços, define a senha do banco,
   cria o banco `local` e importa o dump SQL (`local.sql` ou o primeiro `.sql`);
6. detecta o domínio antigo gravado no banco e avisa quando ele difere do
   novo domínio, para ajuste posterior dos endereços no WordPress;
7. navega até o site restaurado (como na criação normal), aguarda a
   remontagem das visões e então emite a atualização final da interface
   (`refreshSites` + `siteAdded`).

## Exclusão de projetos órfãos

Ao lado de cada órfão candidato há também um botão **Excluir**. O fluxo é:

1. mostra o tamanho da pasta para confirmação explícita em caixa de
   confirmação dentro do próprio painel (sem depender de diálogos externos);
2. move a pasta para a lixeira do sistema (reversível, nada é apagado
   definitivamente);
3. atualiza a lista de órfãos na interface.

A exclusão só é permitida para diretórios dentro das raízes de sites, com
estrutura mínima e sem registro no Local.

Nenhum arquivo do projeto é apagado ou movido. Pela CLI, `node dist/cli.js
analyze <diretório>` mostra a mesma análise em modo somente leitura.

## Princípios de segurança

1. detectar antes de agir;
2. mostrar caminho absoluto e tamanho antes de qualquer operação;
3. nunca apagar automaticamente;
4. validar que todo caminho está dentro da raiz configurada;
5. registrar operações de backup, restauração e limpeza.
