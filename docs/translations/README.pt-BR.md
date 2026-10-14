# BrightLocalWP

Add-on para o [Local](https://localwp.com) (Local by WP Engine) com ferramentas de
manutenção e limpeza de ambientes WordPress locais.

## Recursos

- **Localizar projetos órfãos**: encontra pastas de projetos que existem no disco,
  mas não aparecem na interface do Local;
- **Restaurar projetos**: registra o projeto órfão de volta no Local, com banco
  de dados provisionado e importado, e inicia o site;
- **Excluir com segurança**: move a pasta para a lixeira do sistema ou remove
  permanentemente, sempre com confirmação;
- **Filtros, busca e ordenação** na lista de projetos;
- **Português e inglês**, com seletor no próprio painel.

## Requisitos

- Aplicativo Local instalado (macOS, Windows ou Linux).

## Instalação

1. Extraia o pacote `BrightLocalWP-<versão>.tar.gz` no diretório de add-ons do Local:
   - Linux: `~/.config/Local/addons/`
   - macOS: `~/Library/Application Support/Local/addons/`
   - Windows: `%APPDATA%\Local\addons\`
2. Reinicie o Local.
3. Ative **BrightLocalWP** em *Settings > Add-ons*.

## Como usar

Abra as preferências do Local e selecione **BrightLocalWP**.

### Verificar projetos

Clique em **Verificar projetos** (depois, **Buscar novamente**). O add-on analisa
as pastas onde os projetos registrados estão armazenados e lista cada diretório
como **Registrado**, **Órfão candidato** ou **Ignorado**. Use os filtros de
status, a busca por nome e a ordenação para navegar na lista.

### Restaurar um projeto órfão

Ao lado de cada órfão candidato, clique em **Restaurar** e confirme na caixa que
aparece abaixo do item. O add-on sugere nome e domínio, registra o projeto,
provisiona o banco de dados (importando o dump original quando disponível),
inicia o site e navega até ele. Nada é apagado ou movido.

### Excluir um projeto órfão

Ao lado de cada órfão candidato, clique em **Excluir** e confirme. Você pode
**mover para a lixeira** (reversível) ou **remover permanentemente**
(irreversível, com confirmação em duas etapas). O tamanho da pasta é exibido
antes da confirmação.

### Idioma

O seletor no topo do painel alterna entre português e inglês. A escolha é
salva e vale para todo o add-on.

### Linha de comando (diagnóstico)

```bash
node dist/cli.js scan "$HOME/Local Sites"
node dist/cli.js scan "$HOME/Local Sites" --registered projetos.json --json
node dist/cli.js analyze "$HOME/Local Sites/meu-site"
```

A CLI é somente leitura: analisa e relata, sem alterar nada. Use `--lang en`
para mensagens em inglês (o padrão é português).

## Segurança

- a verificação é somente leitura;
- restauração e exclusão exigem confirmação explícita no painel;
- a exclusão padrão vai para a lixeira; a remoção permanente avisa que é
  irreversível;
- backups automáticos de `sites.json` são criados antes de cada restauração.

## Documentação para desenvolvimento (em inglês)

- [project-context.md](../project-context.md): visão geral e estado atual;
- [architecture.md](../architecture.md): módulos, fluxos e integração com o Local;
- [development.md](../development.md): ambiente, comandos e verificações.
