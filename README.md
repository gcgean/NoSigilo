# NoSigilo

Aplicação web NoSigilo (frontend React/Vite + backend Node/Express).

## Instruções para agentes

Este repositório possui um arquivo [AGENTS.md](C:\Projetos Web\NoSigilo\AGENTS.md) na raiz com as regras permanentes para atuação de agentes no projeto.

Essas instruções foram adaptadas ao contexto atual do NoSigilo e cobrem principalmente:

- comunicação em pt-BR;
- preservação de encoding;
- segurança ao editar arquivos;
- prioridade para mudanças pequenas e estáveis;
- continuidade dos padrões já usados no frontend React/Vite e no backend Node/Express;
- atenção especial para produção, integrações, convites, pagamentos e área administrativa.

## Tecnologias

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Como rodar em desenvolvimento

### Requisitos

- Node.js 20+
- npm 10+

### Passos

```bash
git clone <SEU_REPO_URL>
cd NoSigilo

npm install
cd backend && npm install
```

Rodar o frontend:

```bash
npm run dev
```

Rodar o backend:

```bash
cd backend
npm run dev
```

## Build de produção

Frontend:

```bash
npm run build
```

Backend:

```bash
cd backend
npm run build
```

O conteúdo estático fica em `dist/` na raiz do projeto e o backend compilado em `backend/dist/index.js`.
