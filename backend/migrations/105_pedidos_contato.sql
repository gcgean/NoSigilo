-- 105: pedidos de contato.
-- Mensagem de quem a pessoa nao conhece (e nao e de um tipo de perfil liberado)
-- cai em Pedidos, nao em Conversas, ate ela aceitar ou responder.
-- users.pedidos_contato: NULL = padrao (ligado para mulheres e casais), 'on' ou 'off'.
-- users.pedidos_direto_json: tipos de perfil que vao direto para Conversas.
ALTER TABLE users ADD COLUMN pedidos_contato TEXT;
ALTER TABLE users ADD COLUMN pedidos_direto_json TEXT;
ALTER TABLE conversations ADD COLUMN pedido_para TEXT;
ALTER TABLE conversations ADD COLUMN pedido_aceito_em TEXT;
ALTER TABLE conversations ADD COLUMN pedido_recusado_em TEXT;
ALTER TABLE conversations ADD COLUMN pedido_destaque_em TEXT;
