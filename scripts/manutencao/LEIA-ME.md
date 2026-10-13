# Página de manutenção

`manutencao.html` é mostrada para todos os visitantes enquanto o site está em
manutenção (ex.: na migração de servidor). Arquivo único, sem dependências: não
carrega nada do site, que estará fora do ar. A cada 30 s ela consulta
`/api/health` e recarrega sozinha quando o site volta.

Responde **503 + Retry-After**, então o Google entende que é uma pausa e não
derruba o site das buscas.

## Ativar no nginx (uma vez, no `server {}` do NoSigilo)

```nginx
# Manutenção: liga com `touch /srv/sites/nosigilo/MANUTENCAO`, desliga com `rm`.
if (-f /srv/sites/nosigilo/MANUTENCAO) { return 503; }
error_page 503 @manutencao;
location @manutencao {
    root /srv/sites/nosigilo/app/scripts/manutencao;
    rewrite ^ /manutencao.html break;
    add_header Retry-After 1800 always;
    add_header Cache-Control "no-store" always;
}
```

Depois: `nginx -t && systemctl reload nginx`. Sem o arquivo `MANUTENCAO`, nada muda.

## Usar

- Ligar: `touch /srv/sites/nosigilo/MANUTENCAO`
- Desligar: `rm /srv/sites/nosigilo/MANUTENCAO`

Não precisa recarregar o nginx para ligar ou desligar: ele confere o arquivo a cada pedido.
