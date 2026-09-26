-- 097: imagem (print/foto) anexada pela equipe no chat de suporte.
ALTER TABLE promoter_support_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
