-- 112: mulher tem acesso grátis para sempre (11/10/2026). O acesso é liberado
-- pelo trial até 2099, como o do embaixador oficial.
UPDATE users SET trial_ends_at = '2099-12-31T23:59:59.000Z'
 WHERE LOWER(TRIM(COALESCE(gender, ''))) = 'mulher'
   AND (trial_ends_at IS NULL OR trial_ends_at < '2099-12-31T23:59:59.000Z');
