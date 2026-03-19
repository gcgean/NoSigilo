# NoSigilo

Aplicação web NoSigilo (frontend React/Vite + backend Node/Express).

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
