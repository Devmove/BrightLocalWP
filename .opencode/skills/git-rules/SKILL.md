---
name: git-rules
description: Regras obrigatórias para operações Git no BrightLocalWP.
---

# Regras de Git do BrightLocalWP

Estas regras se aplicam a todo trabalho neste projeto.

## Regra principal

Não execute `git commit` nem `git push` sem permissão explícita do usuário.

Também não execute sem autorização explícita:

- `git reset` ou `git reset --hard`;
- `git checkout` ou `git restore` para descartar alterações;
- `git clean`;
- `git branch -D`;
- merge, rebase, cherry-pick ou alteração de histórico;
- criação ou remoção de worktrees;
- qualquer comando equivalente que possa descartar trabalho ou alterar o
  histórico do repositório.

## Operações permitidas sem confirmação

Podem ser executadas para inspeção ou validação, desde que não alterem o
histórico nem descartem arquivos:

- `git status`;
- `git log`;
- `git diff`;
- `git show`;
- `git branch --list`;
- `git ls-files`.

Adicionar arquivos ao staging (`git add`) também exige autorização se fizer
parte da preparação de um commit. Sem autorização, apenas inspecione as
alterações e informe o usuário.

## Quando o usuário pedir uma alteração

Implemente e valide o código normalmente. Ao final:

1. mostre os arquivos alterados e as verificações executadas;
2. informe que as alterações ainda não foram commitadas;
3. aguarde autorização específica antes de criar um commit ou fazer push.

Uma autorização para implementar uma funcionalidade não implica autorização
para commit ou push.
