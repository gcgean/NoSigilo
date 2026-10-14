#!/bin/bash
# Backup diário para FORA do servidor (Cloudflare R2), criptografado.
#
#   - 5 bancos Postgres (pg_dump -Fc): NoSigilo, Pagamentos, SISLOTE, Gestor, Mix
#   - Fotos e vídeos do NoSigilo (/srv/sites/nosigilo/storage), só o que mudou
#   - Configurações (compose, .env, nginx, chaves SSH autorizadas, crontab)
#
# Tudo passa pelo remoto "backup-cripto:" do rclone (tipo crypt sobre o R2):
# nomes e conteúdo saem cifrados do servidor. Sem a senha do crypt o backup
# não abre — ela fica com o dono, no gerenciador de senhas.
#
# Retenção: bancos e configurações de 14 dias; foto apagada/alterada fica 30 dias.
# Avisa no Telegram do admin quando algo falha (e um resumo às segundas).
set -uo pipefail

DIR=/root/backup
LOG=$DIR/log.txt
TMP=$DIR/hoje
DATA=$(date +%F)
REMOTO=${REMOTO:-backup-cripto:}
mkdir -p "$DIR"
exec >>"$LOG" 2>&1
echo "=== $(date '+%F %T') início"
inicio=$(date +%s)
falhas=""

rm -rf "$TMP" && mkdir -p "$TMP"

# Bancos: dump no formato custom (já comprimido; restaura com pg_restore).
dump() {
  local container=$1 nome=$2
  if docker exec "$container" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP/$nome.dump" && [ -s "$TMP/$nome.dump" ]; then
    echo "banco $nome: $(du -h "$TMP/$nome.dump" | cut -f1)"
  else
    echo "FALHA no banco $nome"
    falhas="$falhas banco-$nome"
  fi
}
dump nosigilo-postgres nosigilo
dump hub_billing_postgres_prod pagamentos
dump sislote_db sislote
dump gestor_projetos-db-1 gestor_projetos
dump mixcampeao-db-1 mixcampeao

# Configurações: arquivos .env e compose de todos os sistemas, nginx e acesso.
crontab -l > "$TMP/crontab.txt" 2>/dev/null
find /srv/sites /opt /srv/mixcampeao -maxdepth 4 \( -name node_modules -o -name storage -o -name .git -o -name data \) -prune -o \
     -type f \( -name '.env' -o -name '.env.production' -o -name 'docker-compose*.yml' \) -print 2>/dev/null > "$TMP/lista-configs.txt"
tar czf "$TMP/configs.tar.gz" --ignore-failed-read -T "$TMP/lista-configs.txt" \
    /etc/nginx /etc/ssh/sshd_config.d /root/.ssh/authorized_keys /root/manutencao "$TMP/crontab.txt" 2>/dev/null \
  || echo "aviso: tar das configurações terminou com alertas"

# Envio dos bancos e configurações do dia.
if ! rclone copy "$TMP" "${REMOTO}bancos/$DATA" --transfers 4 --retries 5 --low-level-retries 20; then
  falhas="$falhas envio-bancos"
fi

# Fotos/vídeos: espelho; o que foi apagado ou trocado vai para "apagadas/<data>".
# Miniaturas (thumbs) ficam de fora: são refeitas sozinhas a partir das originais.
if ! rclone sync /srv/sites/nosigilo/storage "${REMOTO}fotos/atual" --backup-dir "${REMOTO}fotos/apagadas/$DATA" \
     --exclude 'thumbs/**' --exclude '*.tmp*' --transfers 8 --checkers 16 --retries 5 --low-level-retries 20; then
  falhas="$falhas envio-fotos"
fi

# Retenção.
rclone delete "${REMOTO}bancos" --min-age 15d --rmdirs || true
rclone delete "${REMOTO}fotos/apagadas" --min-age 31d --rmdirs || true

tam_bancos=$(du -sh "$TMP" | cut -f1)
rm -rf "$TMP"
min=$(( ($(date +%s) - inicio) / 60 ))
echo "=== $(date '+%F %T') fim (${min} min, ${tam_bancos} de bancos/configs)${falhas:+ FALHAS:$falhas}"

# Aviso no Telegram (mesmo bot dos avisos do admin): falha sempre; resumo às segundas.
if [ -n "$falhas" ] || [ "$(date +%u)" = 1 ]; then
  if [ -n "$falhas" ]; then
    texto="🚨 <b>Backup diário com falha</b>
Falhou:$falhas
Veja /root/backup/log.txt no servidor."
  else
    texto="✅ <b>Backup semanal em dia</b>
Último backup: $DATA (${min} min, ${tam_bancos} de bancos e configurações). Fotos sincronizadas."
  fi
  token=$(docker exec nosigilo-backend printenv TELEGRAM_BOT_TOKEN 2>/dev/null)
  chat=$(docker exec nosigilo-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -t -A -c \"SELECT telegram_chat_id FROM users WHERE email='gcgean@hotmail.com' AND is_admin=1\"" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$token" ] && [ -n "$chat" ]; then
    curl -s -m 20 "https://api.telegram.org/bot$token/sendMessage" -d chat_id="$chat" -d parse_mode=HTML --data-urlencode text="$texto" >/dev/null
  fi
fi
[ -z "$falhas" ]
