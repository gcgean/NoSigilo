import { useEffect, useMemo, useState } from 'react';

type Greeting = { emoji: string; title: string; subtitle: string; accent: string };

/**
 * Saudação contextual no topo do feed — muda conforme o horário/dia.
 * Apenas apresentação: reaproveita o resumo de atividade (feedInsightsSummary)
 * que o Feed já calcula. Reavalia sozinha a cada 5 min para não ficar presa
 * num período do dia enquanto o app fica aberto.
 */
export default function FeedGreeting({ userName, summary }: { userName?: string | null; summary?: string | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const greeting = useMemo<Greeting>(() => {
    const firstName = String(userName || '').trim().split(/\s+/)[0] || '';
    const namePart = firstName ? `, ${firstName}` : '';
    const day = now.getDay(); // 0=Dom ... 5=Sex, 6=Sáb
    const h = now.getHours();

    // Domingo à noite — urgência de encerramento do fim de semana
    if (day === 0 && h >= 20) {
      return {
        emoji: '🌙',
        title: 'Última chance do fim de semana',
        subtitle: summary || 'Veja quem ainda está disponível antes que a semana recomece.',
        accent: 'from-indigo-500/15 via-background to-violet-600/10',
      };
    }

    // Janela de fim de semana: sexta após 17h, sábado e domingo (dia)
    const weekendMode = (day === 5 && h >= 17) || day === 6 || day === 0;
    if (weekendMode) {
      return {
        emoji: '🎉',
        title: 'Sextou!',
        subtitle: summary
          ? `Casais na sua cidade procurando planos pro fim de semana. ${summary}`
          : 'Casais na sua cidade procurando planos pro fim de semana.',
        accent: 'from-pink-500/15 via-background to-orange-400/10',
      };
    }

    // Dias de semana, por período
    if (h >= 6 && h < 12) {
      return {
        emoji: '🌅',
        title: `Bom dia${namePart}!`,
        subtitle: 'Veja quem acordou animado hoje perto de você.',
        accent: 'from-amber-400/15 via-background to-rose-400/10',
      };
    }
    if (h >= 12 && h < 18) {
      return {
        emoji: '☀️',
        title: `Boa tarde${namePart}`,
        subtitle: summary || 'Novas publicações desde o seu último acesso.',
        accent: 'from-sky-400/15 via-background to-cyan-400/10',
      };
    }
    if (h >= 18 && h < 23) {
      return {
        emoji: '🔥',
        title: 'Boa noite — hora de encontrar alguém',
        subtitle: summary || 'Veja quem entrou hoje na sua região.',
        accent: 'from-primary/15 via-background to-rose-500/10',
      };
    }

    // Madrugada (23h–6h)
    return {
      emoji: '🌙',
      title: 'Boa madrugada',
      subtitle: 'A noite ainda é uma criança — veja quem está acordado agora.',
      accent: 'from-indigo-500/15 via-background to-purple-600/10',
    };
  }, [now, userName, summary]);

  return (
    <div className={`mb-3 sm:mb-4 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r ${greeting.accent} px-4 py-3 glass`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none shrink-0" aria-hidden>{greeting.emoji}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">{greeting.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{greeting.subtitle}</p>
        </div>
      </div>
    </div>
  );
}
