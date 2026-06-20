// Fundos para stories de texto. Usamos CSS inline (não classes Tailwind) para
// evitar problemas de purge com nomes de classe dinâmicos.
export type StoryBackground = { id: string; label: string; css: string };

export const STORY_BACKGROUNDS: StoryBackground[] = [
  { id: 'sunset',  label: 'Pôr do sol', css: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)' },
  { id: 'violet',  label: 'Violeta',    css: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)' },
  { id: 'night',   label: 'Noite',      css: 'linear-gradient(135deg, #1e293b 0%, #4c1d95 100%)' },
  { id: 'fire',    label: 'Fogo',       css: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)' },
  { id: 'ocean',   label: 'Oceano',     css: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)' },
  { id: 'candy',   label: 'Doce',       css: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)' },
  { id: 'emerald', label: 'Esmeralda',  css: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)' },
  { id: 'mono',    label: 'Preto',      css: 'linear-gradient(135deg, #111827 0%, #374151 100%)' },
];

const FALLBACK = STORY_BACKGROUNDS[0];

export function backgroundCss(id?: string | null): string {
  if (!id) return FALLBACK.css;
  return STORY_BACKGROUNDS.find((b) => b.id === id)?.css ?? FALLBACK.css;
}
