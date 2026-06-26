-- Destaque de perfil comprado com tokens: data/hora (ISO) até quando o perfil
-- aparece priorizado na descoberta. NULL ou passado = sem destaque.
ALTER TABLE users ADD COLUMN boost_until TEXT;
