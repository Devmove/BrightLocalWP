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

O add-on segue a estrutura de entradas `main` e `renderer` esperada pelo Local.
A integração com a versão específica da API do Local será feita depois de validar o
contrato de leitura/registro de sites e seus caminhos em cada sistema operacional.

## Princípios de segurança

1. detectar antes de agir;
2. mostrar caminho absoluto e tamanho antes de qualquer operação;
3. nunca apagar automaticamente;
4. validar que todo caminho está dentro da raiz configurada;
5. registrar operações de backup, restauração e limpeza.
