import { useEffect, useMemo, useState } from 'react';

type DayTheme = {
  emoji: string;
  title: string;
  subtitle: string;
  accent: string;
};

// Tema sensual por dia da semana — incentiva o usuário a postar.
// índice = getDay() (0=Domingo ... 6=Sábado)
const DAY_THEMES: DayTheme[] = [
  { // Domingo
    emoji: '🛏️',
    title: 'Domingo de Preguiça',
    subtitle: 'Aquele clima de cama o dia todo. Mostra como é o seu domingo mais quente.',
    accent: 'from-indigo-500/15 via-background to-purple-600/10',
  },
  { // Segunda
    emoji: '🔥',
    title: 'Segundou sem Tabu',
    subtitle: 'Começa a semana com ousadia: poste uma foto ou texto que provoque.',
    accent: 'from-primary/15 via-background to-rose-500/10',
  },
  { // Terça
    emoji: '😈',
    title: 'Terça da Tentação',
    subtitle: 'Poste aquilo que ninguém teve coragem hoje. O feed tá esperando.',
    accent: 'from-fuchsia-500/15 via-background to-violet-600/10',
  },
  { // Quarta
    emoji: '💋',
    title: 'Quarta sem Censura',
    subtitle: 'Metade da semana pede um respiro quente. Solte a imaginação no feed.',
    accent: 'from-rose-500/15 via-background to-pink-500/10',
  },
  { // Quinta
    emoji: '📸',
    title: '#TBT — Throwback Quente',
    subtitle: 'Quinta é dia de TBT! Poste aquele registro guardado que merece voltar.',
    accent: 'from-amber-400/15 via-background to-orange-500/10',
  },
  { // Sexta
    emoji: '🍾',
    title: 'Sextou!',
    subtitle: 'Bora esquentar a noite. Compartilhe seu clima de sexta e marque presença.',
    accent: 'from-pink-500/15 via-background to-orange-400/10',
  },
  { // Sábado
    emoji: '❤️‍🔥',
    title: 'Sábado de Encontros',
    subtitle: 'Hoje é dia de marcar algo. Diga o que (e quem) você procura agora.',
    accent: 'from-red-500/15 via-background to-rose-600/10',
  },
];

/**
 * Bloco de tema do dia no topo do feed — muda conforme o dia da semana e
 * incentiva o usuário a postar. Reaproveita o resumo de atividade
 * (feedInsightsSummary) como prova social quando disponível. Reavalia sozinho
 * a cada 5 min para virar o tema à meia-noite sem precisar recarregar.
 */
export default function FeedGreeting({ userName, summary }: { userName?: string | null; summary?: string | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const theme = useMemo(() => DAY_THEMES[now.getDay()] ?? DAY_THEMES[0], [now]);

  const firstName = String(userName || '').trim().split(/\s+/)[0] || '';
  const subtitle = summary ? `${theme.subtitle} ${summary}` : theme.subtitle;

  return (
    <div className={`mb-3 sm:mb-4 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r ${theme.accent} px-4 py-3 glass`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none shrink-0" aria-hidden>{theme.emoji}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">
            {theme.title}{firstName ? <span className="text-muted-foreground font-semibold">{`, ${firstName}`}</span> : ''}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
