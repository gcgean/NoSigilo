# AGENTS.md

## Comunicação

- Comunique-se com o usuário em **pt-BR**, com linguagem direta, prática e objetiva.
- Antes de mudanças relevantes, explique de forma breve **quais arquivos, páginas, componentes, rotas, serviços ou endpoints** serão impactados e **o que será alterado**.
- Em mudanças pequenas e seguras, prefira seguir em frente com clareza em vez de travar o fluxo com perguntas desnecessárias.
- Ao identificar risco, impacto em produção ou efeito colateral não óbvio, pause e alinhe antes de prosseguir.

## Segurança de arquivos

- **Nunca modifique um arquivo somente leitura.**
- Se algum arquivo alvo estiver bloqueado, read-only ou sem permissão de escrita, pare e informe claramente qual arquivo está impedindo a mudança.
- Nunca tente contornar restrições de permissão com soluções forçadas.

## Encoding e integridade textual

- Preserve sempre o **encoding atual do arquivo**.
- Não converta encoding sem necessidade explícita.
- Tenha atenção especial com:
  - acentos e cedilha;
  - arquivos `.sql`, `.json`, `.env`, `.md`, `.tsx`, `.ts`, `.css`;
  - textos exibidos ao usuário;
  - templates de e-mail e mensagens de interface.
- Se houver risco de corromper caracteres, interrompa a alteração e explique o risco.

## Prioridades do projeto

- Este é um sistema web em produção com **frontend React/Vite** e **backend Node/Express**.
- Estabilidade, previsibilidade e compatibilidade têm prioridade sobre refatorações grandes.
- Integridade de dados, autenticação, convites, pagamentos e regras de acesso são áreas sensíveis.
- Prefira mudanças pequenas, seguras e fáceis de reverter.
- Evite refatorações desnecessárias.

## Continuidade do projeto

Antes de implementar:

1. Analise o padrão já usado no projeto.
2. Reaproveite convenções de nomes e organização de arquivos.
3. Preserve a arquitetura existente.
4. Siga os fluxos já adotados para autenticação, rotas, API e UI.

- Consistência com o código atual tem mais valor do que “modernizações” isoladas.
- Só proponha alterações arquiteturais maiores quando forem realmente necessárias ou pedidas pelo usuário.

## Frontend

- Preserve a linguagem visual já adotada no NoSigilo.
- Em telas React:
  - mantenha componentes previsíveis;
  - evite complexidade desnecessária no componente;
  - centralize regras pesadas em serviços, hooks ou utilitários quando fizer sentido;
  - garanta boa usabilidade em desktop e mobile.
- Não introduza bibliotecas novas sem necessidade clara.
- Mudanças de UX devem respeitar o comportamento já esperado pelos usuários, salvo pedido explícito.

## Backend

- Mantenha regras de negócio fora da camada de apresentação sempre que possível.
- Preserve compatibilidade com o fluxo atual de autenticação, convites, assinaturas, integrações e administração.
- Ao mexer em rotas, responses ou persistência:
  - evite breaking changes desnecessárias;
  - preserve contratos já consumidos pelo frontend;
  - trate erros com mensagens úteis e seguras.

## Banco de dados e migrations

- Mudanças de schema devem ser mínimas, claras e seguras para produção.
- Sempre considere compatibilidade com o banco em uso no ambiente real.
- Em migrations:
  - prefira alterações incrementais;
  - evite destruir dados sem necessidade explícita;
  - pense em rollback e impacto operacional.

## Disciplina de implementação

- Primeiro procure como algo semelhante já foi resolvido no projeto.
- Reutilize padrões existentes antes de criar novos.
- Evite duplicação de lógica.
- Ao corrigir bugs, ataque a causa real, não apenas o sintoma visual.

## Qualidade antes de finalizar

Antes de concluir uma tarefa, valide internamente:

- consistência com a arquitetura atual;
- segurança de permissões e arquivos;
- preservação de encoding;
- impacto em produção;
- compatibilidade entre frontend e backend;
- risco de regressão;
- funcionamento em mobile quando a mudança afetar UI.

