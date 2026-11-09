# Handoff NoSigilo (09/11/2026)

Este arquivo passa o contexto para outro chat neste mesmo computador. **Não commitar** (nenhum `CONTEXTO-*.md` vai para o git).

> **Chaves e senhas:** este arquivo não contém nenhuma. Ele só diz onde elas estão.
> - A chave SSH de deploy é `~/.ssh/nosigilo_deploy` (`C:\Users\Pichau\.ssh\nosigilo_deploy`). O outro chat usa o mesmo arquivo, sem copiar.
> - Os segredos de produção ficam no servidor, em `/srv/sites/nosigilo/app/.env.production`. Esse arquivo está fora do git e não deve ser apagado (nunca rode `git clean`).

---

## 1. Projeto e servidor

| | |
|---|---|
| Repo local | `C:\Projetos\dev\NoSigilo` (frontend em `src/`, backend em `backend/src/`) |
| GitHub | `origin/main` |
| Servidor | Hostinger SP `187.127.43.48`. O SSH só aceita chave. |
| Código no servidor | `/srv/sites/nosigilo/app` |
| Stack Docker | `/srv/sites/nosigilo/deploy` |
| Mídia real | `/srv/sites/nosigilo/storage` (volume Docker, não o repo) |
| Postgres | container `nosigilo-postgres`, usuário e banco `nosigilo` |
| nginx | `/etc/nginx/sites-available/nosigilo.conf` |

### Conectar

```bash
ssh -i ~/.ssh/nosigilo_deploy -o BatchMode=yes root@187.127.43.48
```

### Deploy padrão (só com OK explícito do dono: "pode subir" ou "pode publicar")

```bash
ssh -i ~/.ssh/nosigilo_deploy root@187.127.43.48 'cd /srv/sites/nosigilo/app && git pull -q --ff-only && timeout 400 nice -n 19 npm run build && cd ../deploy && docker compose up -d --build --no-deps backend'
```

Health check:

```bash
ssh -i ~/.ssh/nosigilo_deploy root@187.127.43.48 'curl -s http://127.0.0.1:3335/api/health'
```

- As migrations rodam sozinhas quando o backend sobe.
- O backend lê as variáveis do `environment:` do docker-compose. Uma variável nova precisa ser adicionada lá também.
- **Antes de publicar, dê `git push`**, porque o servidor faz `git pull`.

### ⚠️ ESTADO ATUAL: o servidor divergiu do GitHub (verificado em 09/11)

- O servidor tem **2 commits que só existem lá**, feitos por outra sessão direto no servidor e nunca enviados:
  - `491676e` Casa: mostrar faixa da rádio e ajustar aviso de perfil
  - `c30db46` Casa: exibir rádio acima da sala e acomodar controles no celular
- O GitHub tem commits que o servidor ainda não tem. O principal é **`10f7364`** (admin: ver as conversas do denunciado). Também tem `ba06390` (iPhone), se ainda faltar.
- Por isso o `git pull --ff-only` do deploy **vai falhar**.

Como resolver, **com OK do dono**:

1. No servidor:
   ```bash
   cd /srv/sites/nosigilo/app && git fetch && git log --oneline origin/main..HEAD
   ```
   Confirme que só aparecem os 2 commits da rádio.
2. Traga esses 2 commits para o repo local. Pode ser com `git format-patch` no servidor e `git am` local, ou com `git pull --rebase` no servidor seguido de `git push` de lá. Atenção: o servidor talvez não tenha credencial de push.
3. Depois que o servidor estiver em fast-forward com o `origin/main`, rode o deploy padrão.

- **Nunca** use `git reset --hard` no servidor sem salvar esses commits. Isso apagaria o trabalho da outra sessão.
- No servidor, `backend/data/nosigilo.sqlite` aparece modificado e não deve ser mexido. A produção usa Postgres.

---

## 2. Banco de dados em produção (somente leitura)

```bash
ssh -i ~/.ssh/nosigilo_deploy root@187.127.43.48 "docker exec -i -e PGOPTIONS=-cdefault_transaction_read_only=on nosigilo-postgres psql -U nosigilo -d nosigilo -c 'SELECT 1'"
```

- Colunas de data guardadas como texto precisam de `::timestamptz`.
- Para escrever no banco, peça OK ao dono antes.

### Abrir A Casa em modo teste (1h)

Esta é uma escrita, então só com pedido do dono. O cache é de 30 s.

```sql
INSERT INTO system_settings (key, value) VALUES ('casa_aberta_ate', '<ISO UTC daqui 1h>')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO system_settings (key, value) VALUES ('casa_teste', '{"ativo":true,"convidados":[]}')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

- Confira os nomes das colunas de `system_settings` antes, com `\d system_settings`.
- O horário real d'A Casa é sexta das 22h à 1h e sábado das 22h às 2h. **Não reinicie o backend nesse horário.**

---

## 3. Ambiente local

- Use as portas **4011** (backend) e **5180** (frontend). A **8080** é de outra sessão.
- Backend:
  ```bash
  cd backend && DATABASE_URL= DATABASE_FILE=./data/ux-teste.sqlite PORT=4011 FRONTEND_ORIGIN=http://localhost:5180 npx tsx src/index.ts
  ```
- Frontend:
  ```bash
  VITE_API_URL=http://localhost:4011/api npx vite --port 5180 --strictPort
  ```
- Ao terminar, apague `backend/data/ux-*.sqlite` e os arquivos de teste em `backend/storage`.
- Existem 13 `test-*.sqlite` rastreados no git. **Nunca apague com glob**, só os não rastreados.

### Testes

- Backend, um teste:
  ```bash
  cd backend && node node_modules/vitest/vitest.mjs run src/app.test.ts -t "<nome>" --pool=threads --hookTimeout=90000 --testTimeout=60000
  ```
  Depois rode `git checkout -- backend/data/` e remova os sqlite de teste não rastreados.
- Backend, typecheck: `cd backend && npm run typecheck`. **O `tsc -p tsconfig.json` não checa nada.**
- Frontend:
  ```bash
  npx vitest run
  ```
  ```bash
  npx tsc --noEmit -p tsconfig.app.json
  ```

---

## 4. Regras permanentes

1. Responda **em português**.
2. Deploy, escrita no banco, mudança no nginx e envio de mensagem ou ban a usuário: **só com OK explícito do dono no chat**.
3. **Commite só o que é seu.** Confira o `git diff` antes do `git add`. Outra sessão mexe ao mesmo tempo em `Casa.tsx`, `RadioDaCasa.tsx`, `Landing` e `promoter-preview`.
4. Nunca commite `divulgacao/` (1,4 GB; já está no `.gitignore`), `.env.production` nem `CONTEXTO-*.md`.
5. Trailer dos commits: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
6. O Hub nunca entrega webhook ao NoSigilo. O pagamento chega por `syncHubAccessForUser`.
7. A conta do TikTok Ads foi banida permanentemente. Não insista.
8. Nos perfis vitrine ("promotores"), o **🎤 discreto** na bolha **fica**. Não remova a identificação de que são perfis da casa: o dono pediu, e foi combinado manter o ícone pequeno.

---

## 5. O que foi feito nesta sessão (8 e 9/11)

### Notificações
- Toasts desnecessários removidos.
- Radar avisa a cada 6h, no máximo.
- Marcos de visualização do story só em 50 e 200.
- Card "Novos contatos" aparece 1 vez por dia, e a aba "Na região" tem bolinha com o número de novos.
- O tema do dia do feed aparece 1 vez por dia.

### Links clicáveis
- Valem no feed, nos stories, nas mensagens e na bio. Ao sair do site aparece um aviso (`TextoComLinks`, `utils/linksNoTexto.ts`).
- No chat, os links só ficam clicáveis depois que a conversa foi aceita.

### Radar no "Perto de você"
- Mostra só a foto com o ícone do radar. Ao tocar, abre o texto, a opção de responder e "Ativar meu radar também" (`NearbyActivityStrip.tsx`).

### Contos
- Botão em destaque "✍️ Publicar meu conto ou experiência".
- Abas Recentes / Mais curtidos / Não lidos e o filtro "🎧 Com áudio" (`FiltrosContos.tsx`).
- A aba "Perfis curtidos" virou "Curtidos".

### Contos em áudio
- Até 5 partes de 3 min, com opção de disfarçar a voz, tocadas num player único (`GravadorDeAudio.tsx`, `PlayerDoConto.tsx`, `utils/audioDoConto.ts`).
- O servidor comprime com ffmpeg para AAC mono 48 kbps `.m4a`. Rota `/api/experiences/audio`, tabela `experience_audios` (migration 131).
- A transcrição usa `STT_API_KEY` / `STT_BASE_URL` (Groq) / `STT_MODEL`. **Sem chave, o áudio fica `em_revisao`** e o admin aprova em AdminContos.
- O modal "Como foi o seu fim de semana?" vai até domingo às 23h e aceita áudio.

### Perfis sem foto
- Recebem um avatar-silhueta pelo tipo do perfil (`AvatarDoTipo.tsx`, `utils/tipoDoPerfil.ts`).
- O lembrete de foto aparece 1 vez por dia no acesso e 1 vez por dia na busca (`PhotoGateOverlay.tsx`).

### A Casa (`backend/src/casa.ts`)
- Lola fala no máximo 4 vezes a cada 15 min.
- Quebra-gelo com respostas prontas.
- Saída temporária ao trocar de página (antes eram quedas falsas).
- Quarto fechado; Casais está guardado (só o admin vê).
- Convite às mulheres ligado por padrão.
- Lembrete de reserva (`ChamadaDaReserva`).
- "Apimentar" cabine fria.
- Avaliação ao sair da Casa, só para quem nunca avaliou (migration 130, e o admin vê em AdminCasaTab).
- Léo & Bia desligados (`ANFITRIOES_LIGADOS = false`).
- "Fulano está digitando…" nas salas e cabines (`useDigitando.ts`).

### Promotores
- Perfis vitrine (`is_showcase`) entram n'A Casa e só conversam entre si.
- Até 3 duplas, com linguagem brasileira bem safada via DeepSeek.
- Mostram tipo e cidade, usam @ nas menções e postam foto/vídeo da galeria em visualização única.
- O nome do perfil foi corrigido (`ajustarNomeNaFala`).

### Admin
- Botão "Banir (admin)" no perfil.
- Nas denúncias:
  - contador de quantas denúncias o perfil recebeu e de quantas pessoas;
  - botão "💬 Conversas do denunciado (N)", que lista todas as conversas dele e abre qualquer uma (`ConversaDaDenuncia.tsx`, rotas `/api/admin/reports/:id/conversas` e `/conversa?conversa=`).
- Cada leitura fica registrada em `admin_leituras_conversa` (migration 132). **Isso ainda não está em produção** (é o `10f7364`; veja o item 1).

### Tela "Estamos atualizando" travada em 100%
- Corrigida no `main.tsx`: recarrega sem cache velho e mostra um botão depois de 3 tentativas.
- No nginx, o 404 de `/assets/` passou a ser `no-store`. Isso já está em produção, e há um backup `.bak-…-antes-404-assets`.

### iPhone
- Espaço sobrando no Match.
- Teclado no chat (`top=vv.offsetTop`).
- "Digitando…" no chat privado.
- Telas pequenas (`grid-cols-1`, overlay de foto com `my-auto`).

### Git
- O push falhou por causa de `divulgacao/`.
- O commit foi refeito sem a pasta, e ela foi para o `.gitignore`.
- Existe a branch local de backup `backup-antes-do-push-*`.

---

## 6. Pendências

1. **Publicar `10f7364`** (conversas do denunciado). Antes, resolva a divergência do servidor (item 1). Precisa do OK do dono.
2. **Resposta ao Rodrigo** (suporte): o rascunho foi feito, mas não foi enviado. Só envie com OK.
3. **Chave STT (opcional):**
   - colocar a `STT_API_KEY` (Groq) no `.env.production`;
   - colocar a mesma variável no `environment:` do compose.
   O dono é quem cria a chave.
4. Ofertas antigas ainda em aberto:
   - cancelar 8 cobranças de teste antigas do Mercado Pago;
   - respostas para Fabiolda e Ryan77;
   - mandar os comentários do NPS para o suporte.
5. Arquivos da outra sessão não commitados (`RadioDaCasa.tsx`, edições em `Casa.tsx`, `promoter-preview`): **não são seus, não commite**.

---

## 7. Achados da análise d'A Casa de 07/11 (referência)

- 252 pessoas, 101 cabines e 3.471 mensagens.
- 4% eram mulheres e 38% ficaram em silêncio.
- 804 das 1.303 saídas voltaram em menos de 1 min. Eram quedas falsas, causadas pela navegação entre páginas, e já foram corrigidas.
- Reservas:
  - 30% viraram presença;
  - com push, foram 52% contra 26% sem push;
  - 133 pessoas nunca abriram o app.
