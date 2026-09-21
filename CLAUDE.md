# NoSigilo — notas para quem mexe no código

## Checagem de tipos: use os scripts, não o tsc direto

`npx tsc --noEmit -p tsconfig.json` **não checa nada**: a raiz tem `"files": []`
e só aponta para os projetos referenciados. Rodar assim passa "limpo" mesmo com
erro real no código (já aconteceu: uma chamada a um serviço não importado foi
para produção porque a checagem errada disse que estava tudo certo).

O certo, antes de commitar:

```bash
npm run typecheck:all
```

- `npm run typecheck` → frontend (`tsconfig.app.json`).
- `npm --prefix backend run typecheck` → backend.
- `vite build` **não** checa tipos: ele só transpila. Build verde não quer
  dizer código correto.

## Testes

```bash
npm --prefix backend test
```

Os testes usam SQLite; a produção é Postgres. Toda migration precisa existir nas
duas pastas: `backend/migrations` (SQLite, `ADD COLUMN` simples) e
`backend/pg-migrations` (Postgres, com `IF NOT EXISTS`).

Nunca apague `backend/data/*` no geral: há arquivos de teste versionados. Para
limpar só o lixo não versionado:

```bash
git ls-files --others --exclude-standard backend/data/ | xargs -r rm -f
```

## Deploy

1. `git push` para o GitHub.
2. No servidor: `cd /srv/sites/nosigilo/app && git pull -q --ff-only && nice -n 19 npm run build`
3. Backend: `cd ../deploy && nice -n 19 docker compose up -d --build backend`

Os builds usam `nice -n 19` porque o servidor é compartilhado com o site no ar.
