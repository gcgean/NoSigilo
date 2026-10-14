-- 120: origem do cadastro (primeiro contato com o site: Instagram, Google, UTM...).
ALTER TABLE users ADD COLUMN origem_canal TEXT;
ALTER TABLE users ADD COLUMN origem_json TEXT;
