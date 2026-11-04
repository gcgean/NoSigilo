/**
 * Bandeirinha de Portugal ao lado da cidade, só para perfis de Portugal
 * (cidades com UF "PT"). Perfis do Brasil não mostram bandeira nenhuma.
 *
 * SVG e não o emoji 🇵🇹: no Windows o emoji de bandeira aparece como as
 * letras "PT", e o resto da linha já diz "PT".
 */
export const ehPortugal = (state?: string | null) => String(state || '').trim().toUpperCase() === 'PT';

export default function BandeiraPortugal({ state, className = '' }: { state?: string | null; className?: string }) {
  if (!ehPortugal(state)) return null;
  return (
    <svg
      viewBox="0 0 30 20"
      role="img"
      aria-label="Portugal"
      className={`ml-1 inline-block h-[0.8em] w-[1.2em] shrink-0 rounded-[2px] align-[-0.05em] shadow-[0_0_0_0.5px_rgba(0,0,0,0.25)] ${className}`}
    >
      <title>Portugal</title>
      <rect width="12" height="20" fill="#046A38" />
      <rect x="12" width="18" height="20" fill="#DA291C" />
      <circle cx="12" cy="10" r="4.6" fill="#FFE900" />
      <circle cx="12" cy="10" r="3.4" fill="#DA291C" />
      <path d="M10.3 8h3.4v2.6a1.7 1.7 0 0 1-3.4 0z" fill="#fff" />
    </svg>
  );
}
