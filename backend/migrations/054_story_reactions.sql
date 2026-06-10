-- Reações nos stories: adiciona o tipo de reação ao "curtir" de stories.
-- Likes antigos (reaction NULL) contam como reação padrão 'heart'.
ALTER TABLE story_likes ADD COLUMN reaction TEXT;
