# Contexto para o Claude — NoSigilo e servidor (passagem de conta, atualizado em 20/10/2026)

> Cole este arquivo inteiro no começo de um chat novo. Ele resume o que foi
> feito e como trabalhar nos sistemas. **Não contém senhas nem tokens**: esses
> ficam só com o dono (e nos arquivos do servidor).

## Quem é o dono e como ele quer que eu trabalhe
- Dono: Gean (gcgean). Fala português, escreve rápido e com erros de digitação: entender a intenção.
- Respostas em português, curtas, com o que foi feito e o que falta. Sempre explicar em linguagem simples.
- **Nunca digitar senhas/credenciais** nem fazer login por ele. Pagamentos e compras: ele mesmo faz.
- **Mensagem para usuário (suporte), mudança de dados de produção que afeta gente, e qualquer coisa financeira: só com "sim"/"pode" explícito dele.**
- Reiniciar servidor: só com o "sim" dele e de madrugada (~4h). Nunca `do-release-upgrade`.
- Commitar **só os arquivos que eu mexi** (conferir `git diff`/`git status` antes do `git add`; pode haver outra sessão editando).
- Se o classificador de permissões bloquear um comando no servidor (compose, fstab, chaves etc.), **passar o comando para ele rodar** no PowerShell.

## Servidor de produção (desde 15/10/2026)
- **Hostinger KVM 8, São Paulo — IP 187.127.43.48** (srv2063791.hstgr.cloud), Ubuntu 24.04, fuso America/Fortaleza. 8 vCPU / 32 GB / 400 GB NVMe.
- Hospeda tudo: NoSigilo (`/srv/sites/nosigilo`), Hub de pagamentos (`/srv/sites/pagamentos/app`), SISLOTE (`/srv/sites/sislote`), MixCampeão (`/srv/sites/mixcampeao/app/MixCampeao`), Gestor de Projetos (`/opt/gestor_projetos`), Precifica (`/opt/precifica`).
- **SSH só por chave**: `ssh -i ~/.ssh/nosigilo_deploy root@187.127.43.48` (neste PC a chave não é a padrão, precisa do `-i`). Chaves cadastradas: este PC (claude-code-deploy), claude-code-sislote, pc-reserva, pc-3. Atalho local `ssh sislote` já aponta para o IP novo.
- Firewall ufw: só 22/80/443. Containers publicam portas só em 127.0.0.1. Docker 29.1.4 travado (apt-mark hold).
- Disco montado **sem `discard`** (tirado em 15/10: causava travadas de 5–40 s nas gravações). Limpeza semanal pelo `fstrim.timer`.
- Pool do Postgres no backend do NoSigilo: 30 conexões para usuários + pool separado de 4 para `/api/admin` (AsyncLocalStorage em `backend/src/db.ts`).
- Em 16/10 às 8h16 a Hostinger desligou a VPS pelo hipervisor (~10 min fora). Perguntar ao dono se ele clicou em reiniciar; se não, abrir chamado.
- **Contabo antiga 154.53.48.79: PARADA como reserva** (containers parados, arquivo MANUTENCAO criado). **Cancelar antes de 07/11/2026.** Ainda tem a chave temporária `migracao-hostinger-temp` no authorized_keys de lá (remover; o dono roda: `ssh -i $HOME\.ssh\nosigilo_deploy root@154.53.48.79 "sed -i '/migracao-hostinger-temp/d' /root/.ssh/authorized_keys"`). Token da Cloudflare (só DNS) está em `/root/.cloudflare-token` no servidor novo: apagar na Cloudflare quando cancelar a Contabo.

## Deploy do NoSigilo (repositório local `C:\Projetos\dev\NoSigilo`)
1. Commit + `git push` (sempre, senão o servidor puxa código velho). Co-autor no commit: `Co-Authored-By: Claude ...`.
2. No servidor, numa linha só:
   `ssh -o ConnectionAttempts=8 -i ~/.ssh/nosigilo_deploy root@187.127.43.48 "cd /srv/sites/nosigilo/app && git pull -q --ff-only && nice -n 19 npm run build && cd ../deploy && nice -n 19 docker compose up -d --build --no-deps backend"`
- Frontend: o nginx serve `app/dist` direto (só buildar). Backend: container `nosigilo-backend`, compose em `/srv/sites/nosigilo/deploy`. Migrations (`backend/pg-migrations` e `backend/migrations`, numeradas, última = 123) rodam sozinhas no boot.
- **Sempre `--no-deps`. Nunca `--remove-orphans`** (apaga containers do Hub, que também é projeto "app").
- `DATABASE_URL` do NoSigilo usa o host **`nosigilo-postgres`** (nunca `postgres`, que é o banco do Hub na mesma rede).
- `app/.env.production` existe só no servidor, fora do git: **nunca `git clean`** em `app/`.
- Typecheck: `npx tsc --noEmit -p tsconfig.app.json` e `npx tsc --noEmit -p backend/tsconfig.json` (o `tsc -p tsconfig.json` não checa nada).
- Testes: `cd backend && node node_modules/vitest/vitest.mjs run --reporter=basic --pool=threads` (85 testes; às vezes 1 falha por instabilidade ou o comando sai com 127: rodar de novo). Depois limpar lixo: `git ls-files --others --exclude-standard data/ backend/data/ backend/storage | xargs -r rm -f`. Os testes "posts, uploads..." e "paginates feed" às vezes falham por instabilidade; rodar sozinhos confirma.
- Hub de pagamentos tem outro deploy: `docker compose -f docker-compose.prod.yml --env-file .env.production --profile localdb ...`.

## Banco do NoSigilo (consultas)
- Copiar um .sql para o servidor e rodar: `docker exec -i nosigilo-postgres sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB' < /tmp/arquivo.sql`.
- `users.last_seen_at` é timestamptz; os `created_at` são texto ISO (comparar com `TO_CHAR(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`).
- Responder suporte: INSERT em `promoter_support_messages` (sender_type 'admin', sender_id = id do admin gcgean@hotmail.com) com guarda NOT EXISTS; marcar `read_at` nas mensagens do usuário; limpar `system_settings` key `support_handoff:<id>`. Fila = mensagens 'promoter' sem read_at OU handoff preenchido.
- Hub (pagamentos): banco `hub_billing_postgres_prod` (payments status 'captured', plano Mensal R$ 9,90).

## Produto NoSigilo — regras importantes
- Homem paga desde o cadastro (sem período grátis); casal 15 dias; mulher 30 dias e **acesso grátis para sempre se verificar com selfie** (aprovada pelo admin). Outros perfis 7 dias.
- **Trocar tipo de perfil nunca dá dias grátis** (brecha fechada em 17/10). Painel alerta pedidos Homem → casal/mulher e verificações de contas que eram de homem.
- Tokens: ganha curtindo (+1, até 20/dia), comentando (+3), check-in (+5); post (+5), story (+8), foto (+10) e **Top do Dia** (30/20/15/10, às 11h) só para mulher e casal. 100 tokens ganhos viram 1 dia de Premium (comprados não viram).
- Usos de tokens: Coração Quente no story (1), Super Curtida no Match (5), Disponível hoje (10, 12h), story em destaque (15, 24h), destacar pedido de contato (20), destacar perfil (30, 24h), destacar evento (30), presentes no chat (3 a 30, vão para quem recebe).
- Pedido de contato: é só responder que vira conversa (sem botão "Aceitar"; só "Recusar e excluir").
- Excluir conta: conforme o motivo, oferece **pausar a conta** (some para todos, nada é apagado, volta ao entrar), desligar e-mails, corrigir perfil ou ver o estado todo.
- Assistente de IA do suporte: manual em `backend/src/supportAiConhecimento.ts` (atualizar sempre que mudar regra/tela). Painel tem "Melhorar com IA" na resposta manual e na recusa de verificação (DeepSeek).
- LGPD: selfie de verificação privada e apagada após análise; "Baixar meus dados"; GPS arredondado (~1 km), distância em km inteiros; "Em <cidade>" quando um dos dois não tem GPS.

## Feito recentemente (14–17/10/2026)
- Migração Contabo → Hostinger (3 min de manutenção), correção do disco (discard) e do pool de conexões.
- Reengajamento por e-mail voltou a funcionar (comparação de data texto x timestamptz).
- Conversão: benefícios no passo 1 do cadastro (sem mostrar contagem de perfis, pedido do dono), convite de instalar o app para contas novas e guia para sair do navegador do Instagram.
- Verificação de perfil: cartão no próprio perfil; recusa com motivos prontos + IA.
- Stories: aviso quando os tokens acabam (com curtida normal grátis), anel verde girando para quem está online.
- 5 novos usos de tokens, Top do Dia premiado, aviso para ativar GPS (Busca/Match), sugestões de perfis no feed, ajustes de tela (Match cabe na tela, foto vertical 4:5 inteira, menu do iPhone some com zoom, "Sextou" 1x por dia, cidade no chat para o mesmo estado).
- Configurações: trocar nome/tipo de perfil ficaram visíveis (gente excluía a conta achando que não dava).
- Retenção: pausar conta, motivos de saída novos, cartões "primeiros passos" (48h) e privacidade para casais.

## Feito de 18 a 20/10/2026

### A Casa (boate virtual dos casais) — `backend/src/casa.ts` + `casaBrincadeiras.ts`
- Abre **sexta e sábado, 21h à 1h (Brasília)**, sozinha. Inauguração: **sexta 23/10/2026**. Admin pode "Abrir agora por 1h (teste)" ou "noite extra (4h)".
- Salas: Salão, Sala dos Casais (não aceita homem), Quarto Escuro, Glory Hole (anônima). **Homem ocupa no máximo metade de cada sala** (folga de 2 com sala vazia); quando enche, **fila por sala** (é chamado quando abre vaga). Casal/mulher entram direto. Quem não assina entra **espiando** (lê, não ocupa vaga, não fala).
- **Lola** = IA anfitriã: abre, puxa brincadeiras (eu nunca, verdade ou desafio, enquete, quiz, match às cegas, desafio da foto, duelo, relâmpago, revelação), modera, expulsa, fecha, manda resumo. Desafio do momento fica fixo no topo. Brincadeiras quentes; só sorteia quem marcou "Quero brincar".
- Foto/vídeo de **visualização única**; cabines privadas (até 6) com porta aberta (voyeur espia) ou fechada, pedir para entrar / convidar com aprovação de todos; "esquentar a cabine" (provocações da Lola em 3 níveis, todos precisam aceitar).
- Pulseiras, drinks do bar, olhares, show da meia-noite, ranking dos casais, desafios sugeridos com tokens em garantia. Cidade aparece se for do mesmo estado (igual ao chat).
- Tokens: casa_entrada 5 (1/dia), casa_quiz 3 (até 5), casa_desafio 5 (10), casa_duelo 10 (3), casa_relampago 10 (3).
- **Rádio da Casa**: playlist no admin (tipos Música / Vinheta da Lola / Abertura 21h / Fechamento 1h). Uma vinheta a cada 2 músicas; sem música não toca. **Ordem embaralhada por noite** (semente = data da noite; todos da mesma noite ouvem igual); começa do 1º item logo após a abertura das 21h. Volume/mudo no player do usuário. Já cadastradas: abertura, fechamento e 30 vinhetas da Lola (voz ElevenLabs "Carla", gerada pelo dono). **Faltam as músicas**: só livres (Pixabay Music / YouTube Audio Library). Em 20/10 o dono mandou 45 músicas comerciais baixadas do YouTube (`C:\Users\Pichau\Music\Musicas ACASA`): **NÃO cadastrei** (direito autoral/ECAD, risco de derrubada). Meta ~65 músicas livres (4h sem repetir); buscas por estilo: dark R&B, blues/rock sensual, pop slowed, eletrônica sensual, funk BR instrumental.
- Persistência: tabelas casa_mensagens, casa_midia_vistas, casa_eventos, casa_reservas, casa_pontos (migrations 122/123); configurações em system_settings (casa_playlist, casa_aberta_ate, casa_pico:<noite>, casa_aviso:<noite>). Salas, cabines e fila ficam em memória (reiniciar o backend durante a noite esvazia as salas: evitar deploy de sexta/sábado 21h–1h).
- Avisos: push sexta 18h; e-mail para quem reservou quando abre; alertas no Telegram (categoria 'casa', ligada para gcgean); popup de lançamento até 23/10 e depois 1x por conta nova; banner "Casa aberta".
- Páginas: `/casa` (logado, visual escuro) e pública `/acasa` (alias `/a-casa`) com vídeo-tour depois do botão de reservar (`?reservar=1`). Termos de Uso seção 8 "A Casa". Origem `utm_campaign=a-casa` vira canal "A Casa (…)".
- Admin › aba **A Casa**: ao vivo, histórico das noites, ranking, playlist, "A Casa como negócio" (faturamento da noite). Reservas em 20/10: **374** (221 homens, 131 casais, 21 mulheres, 1 outro). Corrigido: o card mostrava 300 (limite da lista de nomes).

### Outras entregas
- Stories: visualizador estilo Instagram (toque curto/duplo, curtida de um toque), vídeo até 60 s, retoma no primeiro não visto, grade com 1 bloco por perfil e contagem visto/não visto, resposta de story de quem a pessoa não segue vai para **Pedidos**. Vitrine vê stories espalhados no tempo.
- iPhone/Safari: faixa vazia embaixo dos stories e espaço no Match corrigidos; zoom automático em campos cortava a tela (inputs 16px + `maximum-scale=1` no index.html).
- Feed sempre abre no feed principal (não em "Contos eróticos").
- Dicas no chat com links clicáveis (`[[Texto|/rota]]`).
- Suporte IA: regras de reembolso/cancelamento; conhecimento da Casa; manual explica campos do perfil (**Status, Descrição e "Link da bio"** — existe e aparece como botão; não confundir com link de convite). Em 19/10 corrigida resposta errada ao Casal sigilo13.
- E-mail: guarda de 80% da cota mensal do Resend (`email_cota_mensal`, padrão 50000; setembro estourou com ~60 mil); e-mail de fim de semana (sexta 20h) vai para quem sumiu (last_seen entre 3 e 60 dias) e convida para A Casa.
- Logo: só o cadeado quando o nome "NoSigilo" está ao lado (BrandLogo).
- Push: inscrição apagada após **3 falhas seguidas** 403 / 500 "do not retry" (404/410 já apagavam).
- Desempenho (19/10): story view responde antes de calcular marco; contagem de curtidas/comentários do ranking do feed em cache de 60 s; "marcar como lida" só atualiza mensagens não lidas. Servidor folgado (CPU ~14%, RAM ~12%, resposta média 26 ms).
- Admin › **Anúncios**: campanhas (canal + janela + valor) com cadastros, pagantes, faturado, **lucro/prejuízo**, retorno, custos e divisão por tipo de perfil. Dados em system_settings `anuncios_campanhas`.
- Admin › Finanças › Assinaturas: coluna **Triais convertidos** (por mês e por dia) + quadro com total e taxa. Em 19/10: 47 de 5.926 triais pagaram; 0,8% dos encerrados (38 casais Ele/Ela).

### Tráfego pago
- Instagram (janela de 24h a partir do meio-dia): R$100 → 115 cadastros / 14 pagantes / R$138,60; R$200 → 204 / 32 / R$316,80; **R$300 → 195 / 32 / R$316,80 (satura acima de R$200)**. Recomendação: R$200/dia + segundo anúncio com outro público; link com `utm_source=instagram_ads`.
- **TikTok Ads: conta "Nosigilo.net1020" suspensa PERMANENTEMENTE em 20/10 (produtos/serviços adultos), antes de gastar (R$0).** Não recorrer, não criar outra conta (arrisca o perfil orgânico). Vídeos prontos em `divulgacao/tiktok/` (servem para Reels).
- Quem mais paga: 25–44 anos; estados SP, CE (Fortaleza é a cidade mais forte), RJ, MG.
- Em anúncios e artes: não usar as palavras "swing" e "glory hole".

### Materiais de divulgação (pasta `divulgacao/`, fora do git — nunca commitar)
- Artes do Instagram da Casa; vídeos: tour da Casa, Reels CTA (com e sem legenda), convite da inauguração, curta, TikTok v1/v2. Pipeline: HTML com `render(t)` + `divulgacao/video/gravar.mjs` (Chrome headless, 24 fps) + ffmpeg **dentro do container** `nosigilo-backend` (no host não tem ffmpeg).
- Voz: o dono gera no ElevenLabs (Carla, Eleven v4, estabilidade 45%, similaridade 75%). Nunca usar voz real de alguém sem consentimento.
- Pendente: vídeo do convite permanente (`casa-convite/narracao2.mp3`, 27,7 s) — falta o texto exato ou permissão para instalar o Whisper.

## Pendências
- [ ] **Músicas livres para a Rádio da Casa** (meta ~65; mínimo 20) antes de sexta 23/10.
- [ ] Conferir a 1ª noite da Casa (23/10): fila de homens, presença de casais/mulheres, faturamento, moderação.
- [ ] Reels CTA ainda pode dizer "quinze dias grátis" no áudio (o dono pode regravar).
- [ ] Remedir conversão de casais por volta de 02/11.
- [ ] Remover a chave temporária da Contabo e **cancelar a Contabo até 07/11**; depois apagar o token da Cloudflare.
- [ ] Backup diário fora do servidor (R2): scripts prontos em `scripts/backup/`; falta o dono criar bucket/token/senhas.
- [ ] Perguntar sobre o desligamento da VPS em 16/10 8h16 (Hostinger).
- [ ] Decisão do dono: homem com aviso claro no cadastro de que é pago **ou** amostra grátis curta (1–2h).
- [ ] Avaliar fraude no cadastro (homem que se cadastra direto como casal/mulher para ganhar período grátis).
- [ ] Remeasure em ~2 semanas: exclusões na primeira hora (eram 47%), "Cadastros por origem", passo 1 do cadastro (61%) e uso do app (Android 20%, iPhone 9%), GPS ativado (17%), stories.
- [ ] Conferir se os e-mails de reengajamento saem às 8h.
- [ ] Monitor de lentidão (`/root/amostra-lentidao.sh`) pode ser religado se voltar a ter picos: `systemd-run --unit=diag-lentidao /root/amostra-lentidao.sh` (log em `/root/amostras-lentidao.log`).

## Outros sistemas (resumo)
- SISLOTE: `/srv/sites/sislote`, containers `sislote_api`/`sislote_db`; o `.env` do backend foi restaurado em 15/10 (estava só com a chave DeepSeek).
- Hub de pagamentos: `/srv/sites/pagamentos/app`; NoSigilo não recebe webhook do Hub (pagamento chega por sincronização).
- FinanceHub e Command Analytics: ver memórias próprias (outros servidores).
