# BrightLocalWP

Add-on para o Local com ferramentas de manutenção e limpeza de ambientes WordPress.

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
ative **BrightLocalWP** em *Settings > Add-ons*. A interface aparece no painel de
detalhes de um site, na seção **Manutenção do ambiente**. O botão **Verificar
diretório** executa uma varredura somente leitura e lista projetos registrados,
candidatos órfãos e diretórios ignorados.

## Princípios de segurança

1. detectar antes de agir;
2. mostrar caminho absoluto e tamanho antes de qualquer operação;
3. nunca apagar automaticamente;
4. validar que todo caminho está dentro da raiz configurada;
5. registrar operações de backup, restauração e limpeza.
