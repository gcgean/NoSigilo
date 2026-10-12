-- 116: marca quando os dados pessoais de uma conta excluída foram apagados (LGPD, art. 16).
-- Vazio = ainda falta apagar; a rotina de limpeza processa essas contas aos poucos.
ALTER TABLE users ADD COLUMN dados_apagados_em TEXT;
