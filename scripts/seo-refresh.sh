#!/bin/sh
# Regenera as paginas regionais de SEO com os numeros de perfis atualizados.
#
# NAO roda o vite: so reescreve dist/swing/**/index.html e dist/sitemap.xml.
# Leva segundos, nao derruba nada e nao mexe no bundle do app — por isso pode
# rodar com o site no ar.
#
# Os numeros vem do Postgres (o gerador consulta via `docker exec`). Se o banco
# nao responder, ele cai para o scripts/seo-stats.json e as paginas saem com os
# numeros antigos, que por serem arredondados para baixo continuam verdadeiros.
#
# Instalar no cron do servidor (uma vez por dia, de madrugada):
#
#   crontab -e
#   17 4 * * * /srv/sites/nosigilo/app/scripts/seo-refresh.sh >> /var/log/seo-refresh.log 2>&1
#
# Por que 4h17 e nao 4h00: horario quebrado evita competir com todo o resto do
# mundo que agenda tarefa na hora cheia.
#
# Por que uma vez por dia e suficiente: a prova social e arredondada para baixo
# (813 vira "Mais de 800"), entao o texto de uma pagina so muda quando a cidade
# cruza a proxima casa. Rodar de hora em hora gastaria o mesmo e mudaria a
# mesma coisa — nada, quase sempre.

set -e

APP_DIR="${APP_DIR:-/srv/sites/nosigilo/app}"
cd "$APP_DIR"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
node scripts/generate-seo-pages.mjs

# O gerador imprime quantas paginas mudaram de conteudo. Na maioria dos dias
# sera zero, e isso e o resultado certo: significa que o sitemap nao vai
# anunciar mudanca que nao houve.
