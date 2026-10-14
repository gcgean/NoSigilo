# Backup diário fora do servidor

`backup-diario.sh` copia, todo dia às 4h30, para o **Cloudflare R2**:

| O quê | Como | Guardado por |
|---|---|---|
| 5 bancos (NoSigilo, Pagamentos, SISLOTE, Gestor, Mix) | `pg_dump -Fc` | 14 dias |
| Configurações (.env, compose, nginx, chaves SSH, crontab) | `configs.tar.gz` | 14 dias |
| Fotos e vídeos do NoSigilo | espelho (só o que mudou) | apagadas/alteradas: 30 dias |

Tudo sai **criptografado** do servidor (remoto `backup-cripto:` do rclone, tipo
*crypt*). Sem a senha do crypt, ninguém lê, nem a Cloudflare. **Guarde as duas
senhas do crypt no gerenciador de senhas: sem elas o backup é inútil.**

Falha → aviso no Telegram do admin. Às segundas chega um resumo de que está em dia.

## Instalação (uma vez)

1. No painel da Cloudflare: **R2 → Create bucket** `backup-servidor`; depois
   **Manage R2 API Tokens → Create API token** com permissão *Object Read & Write*
   só nesse bucket. Anote *Access Key ID*, *Secret Access Key* e o *Account ID*.
2. No servidor (as chaves e senhas são digitadas por você, não passam por ninguém):

```bash
apt-get install -y rclone
rclone config create r2 s3 provider=Cloudflare access_key_id=SUA_ACCESS_KEY secret_access_key=SUA_SECRET endpoint=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
rclone config create backup-cripto crypt remote=r2:backup-servidor password=$(rclone obscure 'SENHA_1') password2=$(rclone obscure 'SENHA_2')
```

3. Script e agendamento (4h30, horário de menor movimento):

```bash
mkdir -p /root/backup && cp /srv/sites/nosigilo/app/scripts/backup/backup-diario.sh /root/backup/ && chmod +x /root/backup/backup-diario.sh
(crontab -l; echo '30 4 * * * /root/backup/backup-diario.sh') | crontab -
```

4. Primeiro backup na hora (o envio das fotos demora mais na primeira vez):
   `/root/backup/backup-diario.sh; tail -20 /root/backup/log.txt`

## Restaurar

Listar o que existe: `rclone lsd backup-cripto:bancos`

**Um banco** (ex.: NoSigilo do dia 2026-10-14) num banco de TESTE, para conferir:

```bash
rclone copy backup-cripto:bancos/2026-10-14/nosigilo.dump /tmp/restaura/
docker run -d --name teste-restaura -e POSTGRES_PASSWORD=teste postgres:16
docker cp /tmp/restaura/nosigilo.dump teste-restaura:/tmp/ && sleep 5
docker exec teste-restaura sh -c 'createdb -U postgres nosigilo && pg_restore -U postgres -d nosigilo --no-owner /tmp/nosigilo.dump'
docker exec teste-restaura psql -U postgres -d nosigilo -c 'SELECT count(*) FROM users'
docker rm -f teste-restaura
```

**Fotos** (todas, ou uma pasta): `rclone copy backup-cripto:fotos/atual /srv/sites/nosigilo/storage`

**Configurações**: `rclone copy backup-cripto:bancos/<data>/configs.tar.gz /tmp/` e `tar xzf` onde precisar.
