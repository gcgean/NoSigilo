import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { guardarDestinoPosCadastro } from '@/utils/destinoPosCadastro';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';

/**
 * Página pública d'A Casa (/acasa; /a-casa também funciona), para divulgar fora do site.
 * Quem chega aqui fica marcado com origem "A Casa" (primeiroToque) e, ao criar a
 * conta, cai direto na Casa. ?invite=<token> leva o convite do promotor junto.
 */
type Publico = {
  reservas: number;
  aberta: boolean; tema: { nome: string; descricao: string } | null; pessoas: number;
  proximaAbertura: string | null; salas: { nome: string; emoji: string; descricao: string; nivel: string }[];
};

function contagem(alvo: string | null, agora: number) {
  if (!alvo) return null;
  const s = Math.max(0, Math.floor((Date.parse(alvo) - agora) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  return { d, h, m, seg };
}

const EXEMPLOS = [
  '🍷 Eu nunca… fiz troca de casais completa.',
  '🎲 Verdade: qual fantasia ninguém desta sala imagina?',
  '😈 Desafio: escolha alguém e chame pra cabine agora.',
  '💘 Match às cegas: vocês dois combinam. Topam a cabine?',
];

export default function ACasaPublica() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [info, setInfo] = useState<Publico | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const convite = params.get('invite')?.trim() || '';

  useEffect(() => {
    document.title = 'A Casa: casa liberal online e boate liberal virtual | NoSigilo';
    const carregar = () => apiClient.get('/casa/publico').then((r) => setInfo(r.data)).catch(() => {});
    void carregar();
    const t1 = setInterval(carregar, 60_000);
    const t2 = setInterval(() => setAgora(Date.now()), 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  // Veio do e-mail (?reservar=1) já logado: reserva direto na Casa.
  useEffect(() => {
    if (isAuthenticated && params.get('reservar') === '1') navigate('/casa?reservar=1', { replace: true });
  }, [isAuthenticated, params, navigate]);

  const quero = () => {
    if (isAuthenticated) { navigate(info && !info.aberta ? '/casa?reservar=1' : '/casa'); return; }
    guardarDestinoPosCadastro('/casa');
    navigate(convite ? `/register?invite=${encodeURIComponent(convite)}` : '/register');
  };
  const c = contagem(info?.proximaAbertura ?? null, agora);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-fuchsia-950 to-zinc-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex justify-center"><BrandLogo /></div>

        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-300">Boate virtual · só para maiores de 18</p>
          <h1 className="mt-2 text-5xl font-black">A Casa 🔥</h1>
          <p className="mt-3 text-base text-white/85">
            A casa de swing online do NoSigilo, feita para a nossa comunidade. Toda <b>sexta e sábado às 22h, até 1h</b>: salas ao vivo com casais, mulheres e singles,
            brincadeiras quentes e cabine a dois.
          </p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/5 p-5 text-center">
          {info?.aberta ? (
            <>
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-300">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> ABERTA AGORA{info.tema ? ` · ${info.tema.nome}` : ''}
              </p>
              <p className="mt-2 text-4xl font-black">🔥</p>
              <p className="text-sm text-white/70">{info.pessoas > 0 ? 'várias pessoas lá dentro neste momento' : 'a festa está começando'}</p>
            </>
          ) : c ? (
            <>
              <p className="text-sm text-white/70">A próxima noite começa em</p>
              <div className="mt-2 flex justify-center gap-3 font-black tabular-nums">
                {[['dias', c.d], ['h', c.h], ['min', c.m], ['seg', c.seg]].map(([r, v]) => (
                  <div key={String(r)} className="w-16 rounded-xl bg-black/40 py-2">
                    <p className="text-2xl">{String(v).padStart(2, '0')}</p>
                    <p className="text-[10px] font-normal text-white/60">{r}</p>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-white/70">Sexta e sábado às 22h.</p>}
        </div>

        <Button size="lg" className="h-14 w-full bg-gradient-to-r from-rose-600 to-fuchsia-600 text-lg font-bold" onClick={quero}>
          {isAuthenticated ? (info && !info.aberta ? '🎟️ Reservar meu lugar' : 'Entrar na Casa') : 'Quero entrar na Casa'}
        </Button>
        {!info?.aberta && (info?.reservas ?? 0) > 0 && (
          <p className="text-center text-sm text-fuchsia-200">🎟️ {info?.reservas} pessoa(s) já reservaram lugar para a próxima noite</p>
        )}
        {!isAuthenticated && (
          <p className="text-center text-sm text-white/70">
            Já tem conta? <Link to="/login" state={{ from: { pathname: '/casa' } }} className="font-semibold text-fuchsia-300 underline">Entrar</Link>
          </p>
        )}

        {/* Vídeo de apresentação narrado pela Lola (arquivos em storage/casa-apresentacao). */}
        <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-3xl border border-fuchsia-500/40 shadow-[0_0_60px_rgba(236,72,153,0.35)]">
          <video
            src="/api/casa/apresentacao/video.mp4"
            poster="/api/casa/apresentacao/capa.jpg"
            controls
            playsInline
            preload="metadata"
            className="block aspect-[9/16] w-full bg-black object-cover"
          />
        </div>
        <p className="-mt-3 text-center text-xs text-white/60">▶️ Aperte o play: a Lola te mostra como funciona (1 min)</p>

        <div className="space-y-3">
          {(info?.salas ?? []).map((s) => (
            <div key={s.nome} className="flex gap-3 rounded-2xl bg-white/5 p-4">
              <span className="text-3xl">{s.emoji}</span>
              <div>
                <p className="font-semibold">{s.nome} {s.nivel === 'muito_quente' && <span className="ml-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">MUITO QUENTE</span>}</p>
                <p className="text-sm text-white/70">{s.descricao}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-fuchsia-800/60 to-rose-800/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-200">💋 Lola, a anfitriã IA, puxa o jogo</p>
          <ul className="mt-3 space-y-2">
            {EXEMPLOS.map((e, i) => (
              <li key={e} className={i >= 2 ? 'select-none text-sm blur-[3px]' : 'text-sm'}>{e}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-white/70">E muito mais: enquetes, quiz liberal e desafios de story. Lá dentro fica bem mais quente 😈</p>
        </div>

        <ul className="grid gap-2 text-sm text-white/80">
          <li>🎵 Música ao vivo, a mesma para toda a casa</li>
          <li>🚪 Cabine a dois: só abre se os dois aceitarem</li>
          <li>🔒 Discrição total: e-mail e localização exata nunca aparecem</li>
          <li>👫 Casais e mulheres em destaque; homens são no máximo metade de cada sala</li>
        </ul>

        <Button size="lg" variant="outline" className="h-12 w-full border-white/30 bg-transparent text-white hover:bg-white/10" onClick={quero}>
          {isAuthenticated ? 'Entrar na Casa' : 'Criar conta e entrar'}
        </Button>
        <p className="text-center text-[11px] text-white/50">Somente maiores de 18 anos. Consentimento sempre.</p>
      </div>
    </div>
  );
}
