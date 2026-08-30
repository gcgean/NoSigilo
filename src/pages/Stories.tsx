import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Eye, MessageCircle, Trash2, X, Send, Heart,
  Lock, Crown, Sparkles, ImageIcon, Volume2, VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { storiesService, profileService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { PHOTO_REACTIONS, REACTION_EMOJI } from '@/lib/reactions';
import { STORY_BACKGROUNDS, backgroundCss } from '@/lib/storyBackgrounds';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const HOT_HEART = '❤️‍🔥'; // Coração Quente (reação especial que consome 1 token)

// Cores do texto sobre a mídia (deve casar com a whitelist do backend).
const OVERLAY_COLORS = ['#ffffff', '#000000', '#ec4899', '#facc15', '#22d3ee'];

// Overlay: x/y em % (0-100) do container, cor e tamanho. `pos` é o formato antigo
// (topo/centro/rodapé) mantido para retrocompatibilidade dos stories já criados.
type TextOverlay = { pos?: string; color: string; x?: number; y?: number; size?: string };
type StoryLike = { mediaUrl: string | null; mimeType: string; text?: string | null; background?: string | null; textOverlay?: TextOverlay | null };

// Fração da largura do container por tamanho de fonte (escala igual em qualquer tela).
const OVERLAY_SIZE_FRAC: Record<string, number> = { sm: 0.055, md: 0.08, lg: 0.11, xl: 0.145 };

/** Normaliza o overlay: converte o formato antigo {pos} para x/y e aplica defaults. */
function normalizeOverlay(o?: TextOverlay | null) {
  const color = o?.color || '#ffffff';
  const sizeFrac = OVERLAY_SIZE_FRAC[o?.size || 'md'] ?? OVERLAY_SIZE_FRAC.md;
  const x = typeof o?.x === 'number' ? Math.min(100, Math.max(0, o.x)) : 50;
  const y = typeof o?.y === 'number'
    ? Math.min(100, Math.max(0, o.y))
    : (o?.pos === 'top' ? 18 : o?.pos === 'bottom' ? 82 : 50);
  return { x, y, color, sizeFrac };
}

/** Texto posicionado (x/y%) e dimensionado (proporcional à largura da mídia) — só leitura. */
function StoryTextOverlay({ text, overlay }: { text: string; overlay?: TextOverlay | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const update = () => setBoxW(parent.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  const { x, y, color, sizeFrac } = normalizeOverlay(overlay);
  const fontSize = Math.max(9, boxW * sizeFrac);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: '86%' }}
    >
      <p className="text-center font-bold leading-snug break-words [text-shadow:_0_2px_8px_rgba(0,0,0,0.85)]" style={{ color, fontSize }}>
        {text}
      </p>
    </div>
  );
}

/** Renderiza o conteúdo de um story: texto com fundo, vídeo ou imagem (com overlay de texto opcional). */
function StoryContent({ story, thumb = false }: { story: StoryLike; thumb?: boolean }) {
  if (!story.mediaUrl && story.text) {
    return (
      <div
        className={cn('flex h-full w-full items-center justify-center text-center', thumb ? 'p-2' : 'p-8')}
        style={{ background: backgroundCss(story.background) }}
      >
        <p className={cn('font-bold leading-snug text-white break-words', thumb ? 'text-[11px] line-clamp-4' : 'text-2xl')}>
          {story.text}
        </p>
      </div>
    );
  }
  const media = story.mimeType.startsWith('video/')
    ? <video src={resolveServerUrl(story.mediaUrl || '')} className="h-full w-full object-cover" muted playsInline {...(thumb ? {} : { autoPlay: true, loop: true })} />
    : <img src={resolveServerUrl(story.mediaUrl || '')} alt="" className="h-full w-full object-cover" />;

  if (story.mediaUrl && story.text) {
    return (
      <div className="relative h-full w-full">
        {media}
        <StoryTextOverlay text={story.text} overlay={story.textOverlay} />
      </div>
    );
  }
  return media;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MyStory = {
  id: string; mediaUrl: string | null; mimeType: string;
  text?: string | null; background?: string | null; textOverlay?: TextOverlay | null;
  createdAt: string; expiresAt: string;
  viewCount: number; commentCount: number; likeCount: number;
};

type FeedStory = {
  id: string; mediaUrl: string | null; mimeType: string;
  text?: string | null; background?: string | null; textOverlay?: TextOverlay | null;
  createdAt: string; expiresAt: string; viewed: boolean;
  likeCount: number; likedByMe: boolean; myReaction?: string | null;
  author: {
    id: string; name: string; gender: string | null; avatar: string | null;
    age: number | null; partnerAge: number | null;
    city: string | null; state: string | null; bio: string | null;
    fetiches: string[]; intentions: string[];
    distanceKm: number | null;
  };
};

type Viewer   = { id: string; name: string; avatar: string | null; viewedAt: string; reaction: string | null; comment: string | null };
type Comment  = { id: string; text: string; createdAt: string; commenter: { id: string; name: string; avatar: string | null } };

function timeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m restantes`;
  return `${m}m restantes`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Quantos pixels do fim da tela estão cobertos pela barra do navegador (ou pelo
 * teclado). É a diferença entre a altura que o CSS enxerga (innerHeight, que
 * conta a faixa da barra do Safari mesmo com ela visível) e a altura realmente
 * visível (visualViewport).
 *
 * Definir a ALTURA do container a partir do visualViewport não bastou: o
 * container é `fixed`, ancorado na viewport de LAYOUT, que pode estar deslocada
 * em relação à visível. Por isso a conta aqui é a mesma que o Chat já usava com
 * sucesso: manter o container preso em top:0/bottom:0 e empurrar o conteúdo
 * para cima com um padding do tamanho exato da faixa coberta.
 *
 * Retorna 0 quando não há nada cobrindo — aí vale o padding da área segura
 * (indicador de home), como no Chat.
 */
function useBottomChromeInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const update = () => {
      const visivel = vv ? vv.height : window.innerHeight;
      setInset(Math.max(0, Math.round(window.innerHeight - visivel)));
    };
    update();
    // scroll também: no iOS a barra some/aparece durante a rolagem, e o
    // visualViewport só emite 'resize' depois que a animação termina.
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return inset;
}

/**
 * Trava a rolagem da página enquanto um overlay de tela cheia está aberto.
 *
 * Sem isso a página de trás continua rolável: aparece barra de rolagem por cima
 * do story e, no iOS, qualquer arrasto faz a barra do Safari aparecer/sumir —
 * mudando a altura útil no meio da visualização e cortando o rodapé.
 * Mesmo padrão já usado no Chat.
 */
function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    const anterior = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    // Evita o "puxar para atualizar" e o repique elástico do iOS por trás do overlay.
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = anterior.htmlOverflow;
      body.style.overflow = anterior.bodyOverflow;
      body.style.overscrollBehavior = anterior.bodyOverscroll;
    };
  }, [active]);
}

// ─── Story Viewer (fullscreen) ────────────────────────────────────────────────
function StoryViewer({
  stories,
  startIndex,
  myUserId,
  isPremium,
  onClose,
}: {
  stories: FeedStory[];
  startIndex: number;
  myUserId: string;
  isPremium: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const bottomInset = useBottomChromeInset();
  useBodyScrollLock(true); // o visualizador só existe montado, então trava sempre
  const [idx, setIdx]           = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [comment, setComment]   = useState('');
  const [sending, setSending]   = useState(false);
  const [clearing, setClearing] = useState(false);
  const [liked, setLiked]       = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeAnim, setLikeAnim] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [muted, setMuted] = useState(true); // começa mudo (política de autoplay); som liga com o botão
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const heldRef = useRef(false);       // true quando foi "segurar" (não é toque)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const story = stories[idx];

  // Mantém o ref em sincronia (o loop de animação lê o ref, não o estado).
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  // Pausa/retoma o vídeo conforme o "segurar".
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else void v.play().catch(() => {});
  }, [paused]);

  // Segurar-para-pausar (estilo Instagram). Um toque rápido navega (tap zones);
  // segurar > 180ms pausa; ao soltar, retoma.
  const startHold = useCallback(() => {
    heldRef.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { heldRef.current = true; setPaused(true); }, 180);
  }, []);
  const endHold = useCallback(() => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    setPaused(false);
  }, []);

  // Sincroniza like ao trocar de story e zera o progresso.
  useEffect(() => {
    setLiked(story.likedByMe ?? false);
    setLikeCount(story.likeCount ?? 0);
    setMyReaction(story.myReaction ?? null);
    setShowReactions(false);
    setProgress(0);
  }, [story.id, story.mimeType]);

  const go = useCallback((delta: number) => {
    // Amostra grátis: não-assinante vê só 1 story; ao tentar avançar, vai pro paywall.
    if (!isPremium) { onClose(); navigate('/subscriptions'); return; }
    const next = idx + delta;
    if (next < 0 || next >= stories.length) { onClose(); return; }
    setIdx(next);
  }, [idx, stories.length, onClose, isPremium, navigate]);

  // Auto-avanço estilo Instagram: imagem/texto enchem a barra em ~5s e passam
  // para o próximo. Vídeo é controlado pelo tempo do próprio vídeo (onTimeUpdate
  // + onEnded). Não-assinante não auto-avança (fica na amostra até tocar).
  useEffect(() => {
    if (story.mimeType.startsWith('video/')) return; // vídeo: progresso pelo player
    if (!isPremium) { setProgress(100); return; }
    const DURATION = 5000;
    let raf = 0;
    let acc = 0;                       // ms acumulados (não avança enquanto pausado)
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last; last = now;
      if (!pausedRef.current) {
        acc += dt;
        const pct = Math.min((acc / DURATION) * 100, 100);
        setProgress(pct);
        if (pct >= 100) { go(1); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story.id, story.mimeType, isPremium, go]);

  // Registrar view
  useEffect(() => {
    void storiesService.view(story.id).catch(() => {});
  }, [story.id]);

  const handleSendComment = async () => {
    if (!comment.trim() || sending) return;
    setSending(true);
    try {
      await storiesService.addComment(story.id, comment.trim());
      // Efeito de apagar: fade-out → limpa → fade-in
      setClearing(true);
      await new Promise((r) => setTimeout(r, 220));
      setComment('');
      setClearing(false);
      toast({ title: 'Resposta enviada ✓', description: 'Sua resposta foi enviada nas mensagens.' });
    } catch {
      toast({ title: 'Erro ao enviar', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (reaction: string) => {
    setShowReactions(false);
    const prev = { liked, likeCount, myReaction };
    // Atualização otimista
    const isToggleOff = myReaction === reaction;
    setMyReaction(isToggleOff ? null : reaction);
    setLiked(!isToggleOff);
    setLikeCount((c) => c + (isToggleOff ? -1 : myReaction ? 0 : 1));
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    try {
      const res = await storiesService.like(story.id, reaction as any);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
      setMyReaction(res.myReaction);
    } catch (err) {
      setLiked(prev.liked);
      setLikeCount(prev.likeCount);
      setMyReaction(prev.myReaction);
      if (reaction === 'hot' && (err as any)?.response?.status === 402) {
        toast({
          title: 'Tokens insuficientes',
          description: 'O Coração Quente custa 1 token. Ganhe tokens publicando e interagindo na plataforma.',
          variant: 'destructive',
        });
      }
    }
  };

  // Touch navigation (esquerda/direita)
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  return createPortal((
    // O container cobre a viewport de LAYOUT inteira (inset-0) e o conteúdo é
    // empurrado para cima por um padding do tamanho exato da faixa que a barra
    // do Safari cobre (ver useBottomChromeInset). Sem barra, o padding vira a
    // área segura do indicador de home.
    //
    // Tentar resolver pela ALTURA do container (100svh / 100dvh / medir o
    // visualViewport) não funcionou: as unidades de CSS contam a faixa da barra
    // mesmo com ela na tela, e um `fixed` se ancora na viewport de layout, que
    // pode estar deslocada da visível. Empurrar o conteúdo com padding não
    // depende de nenhuma dessas duas coisas — é o que o Chat já fazia.
    <div
      className="fixed inset-0 z-[9995] flex flex-col bg-black"
      style={{ paddingBottom: bottomInset > 0 ? bottomInset : 'env(safe-area-inset-bottom, 0px)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bars */}
      <div className="flex gap-1 px-3 pt-3 pb-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white transition-none"
              style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 pb-2">
        {story.author.avatar ? (
          <img src={resolveServerUrl(story.author.avatar)} alt={story.author.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white/60" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm ring-2 ring-white/60">
            {story.author.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{story.author.name}</p>
          <p className="text-xs text-white/60">{timeLeft(story.expiresAt)}</p>
        </div>
        {story.mimeType.startsWith('video/') && (
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            className="text-white/80 hover:text-white p-1"
            aria-label={muted ? 'Ativar som' : 'Silenciar'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Media */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
      >
        {!story.mediaUrl && story.text ? (
          <div
            key={story.id}
            className="flex h-full w-full items-center justify-center px-8 text-center"
            style={{ background: backgroundCss(story.background) }}
          >
            <p className="text-2xl font-bold leading-snug text-white break-words">{story.text}</p>
          </div>
        ) : story.mimeType.startsWith('video/') ? (
          <video
            key={story.id}
            ref={videoRef}
            src={resolveServerUrl(story.mediaUrl || '')}
            className="h-full w-full object-cover"
            autoPlay muted={muted} playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress(Math.min((v.currentTime / v.duration) * 100, 100));
            }}
            onEnded={() => go(1)}
          />
        ) : (
          <img
            key={story.id}
            src={resolveServerUrl(story.mediaUrl || '')}
            alt=""
            className="h-full w-full object-cover"
          />
        )}

        {/* Texto por cima da mídia (estilo Instagram) */}
        {story.mediaUrl && story.text ? (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            <StoryTextOverlay text={story.text} overlay={story.textOverlay} />
          </div>
        ) : null}

        {/* Navigation tap zones — só na metade superior para não bloquear os botões */}
        <button
          type="button"
          className="absolute left-0 top-0 h-3/5 w-1/3 z-10"
          onClick={() => { if (heldRef.current) { heldRef.current = false; return; } go(-1); }}
          aria-label="Anterior"
        />
        <button
          type="button"
          className="absolute right-0 top-0 h-3/5 w-1/3 z-10"
          onClick={() => { if (heldRef.current) { heldRef.current = false; return; } go(1); }}
          aria-label="Próximo"
        />

        {/* Profile info overlay estilo Match — não own story */}
        {story.author.id !== myUserId && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-16">
            {/* Linha 1: Nome + idade */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-white leading-tight">
                {story.author.name}
                {story.author.age != null && `, ${story.author.age}`}
                {story.author.partnerAge != null && ` & ${story.author.partnerAge}`}
              </span>
            </div>

            {/* Linha 2: apenas o gênero (sem localização) */}
            {story.author.gender && (
              <p className="text-sm text-white/80 mt-0.5">
                {story.author.gender}
              </p>
            )}

            {/* Fetiches + intenções */}
            {(story.author.intentions.length > 0 || story.author.fetiches.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {story.author.intentions.slice(0, 2).map((i) => (
                  <span key={i} className="rounded-full bg-primary/80 px-2 py-0.5 text-[10px] text-white font-medium">{i}</span>
                ))}
                {story.author.fetiches.slice(0, 3).map((f) => (
                  <span key={f} className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white/90">{f}</span>
                ))}
              </div>
            )}

            {/* Botões Ver Perfil + Mandar msg (igual Match) */}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/users/${story.author.id}`); }}
                className="flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 active:scale-95 transition-all"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Ver Perfil
              </button>
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/chat?userId=${story.author.id}`); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 active:scale-95 transition-all"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Mandar msg
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Comment bar + Like (not own story) */}
      {story.author.id !== myUserId && (
        <div className="relative z-30 flex items-center gap-2 border-t border-white/10 bg-black/80 px-3 py-3">
          {/* Botão reagir (tap = reação atual/💜, segurar = escolher) */}
          <div className="relative shrink-0">
            {showReactions && (
              <div className="absolute bottom-full left-0 z-50 mb-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/90 px-2 py-1.5 shadow-xl backdrop-blur-sm">
                {PHOTO_REACTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void handleReact(r.id)}
                    className={cn('text-xl leading-none transition-transform hover:scale-125', myReaction === r.id && 'scale-125')}
                    aria-label={`Reagir ${r.emoji}`}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowReactions((v) => !v)}
              className="flex flex-col items-center gap-0.5"
              aria-label="Reagir ao story"
            >
              {myReaction ? (
                <span className={cn('text-2xl leading-none transition-transform duration-200', likeAnim && 'scale-125')}>
                  {myReaction === 'hot' ? HOT_HEART : (REACTION_EMOJI[myReaction] ?? '💜')}
                </span>
              ) : (
                <Heart className={cn('h-6 w-6 text-white/70 transition-all duration-200', likeAnim && 'scale-125')} />
              )}
              {likeCount > 0 && (
                <span className="text-[9px] text-white/60 leading-none">{likeCount}</span>
              )}
            </button>
          </div>

          {/* Coração Quente — reação especial que consome 1 token */}
          <button
            type="button"
            onClick={() => void handleReact('hot')}
            className={cn(
              'flex shrink-0 flex-col items-center gap-0.5 rounded-full px-2 py-1 transition-all active:scale-90',
              myReaction === 'hot' ? 'bg-rose-500/25 ring-1 ring-rose-400/60' : 'hover:bg-white/10'
            )}
            aria-label="Dar um Coração Quente (1 token)"
            title="Coração Quente · custa 1 token"
          >
            <span className={cn('text-2xl leading-none transition-transform duration-200', likeAnim && myReaction === 'hot' && 'scale-125')}>
              {HOT_HEART}
            </span>
            <span className="text-[8px] font-semibold leading-none text-white/60">1 token</span>
          </button>

          {/* Input comentário com efeito de apagar */}
          <input
            className={cn(
              'flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition-opacity duration-200',
              clearing ? 'opacity-0' : 'opacity-100'
            )}
            placeholder="Responder ao story..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSendComment(); }}
            disabled={sending}
          />
          <button
            type="button"
            disabled={sending || !comment.trim()}
            onClick={() => void handleSendComment()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary disabled:opacity-40 shrink-0 transition-all"
          >
            {sending
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Send className="h-4 w-4 text-white" />}
          </button>
        </div>
      )}
    </div>
  ), document.body);
}

// ─── Stats Modal (viewers + comments) ────────────────────────────────────────
function StatsModal({
  storyId,
  isPremium,
  onClose,
  onUpgrade,
}: {
  storyId: string;
  isPremium: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const navigate = useNavigate();
  const bottomInset = useBottomChromeInset();
  const [tab, setTab]         = useState<'viewers' | 'comments'>('viewers');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      storiesService.getViewers(storyId),
      storiesService.getComments(storyId),
    ]).then(([v, c]) => {
      setViewers(v.viewers);
      setComments(c.comments);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [storyId, isPremium]);

  return (
    <div
      className="fixed inset-0 z-[9996] flex items-end justify-center bg-black/70"
      style={{ paddingBottom: bottomInset > 0 ? bottomInset : 'env(safe-area-inset-bottom, 0px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-border bg-background pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h3 className="font-semibold">Estatísticas do story</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {!isPremium ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h4 className="text-lg font-bold">Recurso Premium</h4>
            <p className="text-sm text-muted-foreground">Assine para ver quem visualizou e comentou nos seus stories.</p>
            <Button className="gap-2 bg-gradient-to-r from-primary to-violet-600" onClick={onUpgrade}>
              <Crown className="h-4 w-4" /> Ver planos
            </Button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b">
              {(['viewers', 'comments'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-3 text-sm font-medium transition-colors',
                    tab === t ? 'border-b-2 border-primary text-brand-pink' : 'text-muted-foreground'
                  )}
                >
                  {t === 'viewers' ? `👁️ ${viewers.length} visualizações` : `💬 ${comments.length} comentários`}
                </button>
              ))}
            </div>

            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : tab === 'viewers' ? (
                viewers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma visualização ainda.</p>
                ) : (
                  // Destaque: Coração Quente primeiro, depois quem curtiu, depois o resto.
                  [...viewers].sort((a, b) => {
                    const rank = (r: string | null) => (r === 'hot' ? 0 : r ? 1 : 2);
                    return rank(a.reaction) - rank(b.reaction);
                  }).map((v) => {
                    const isHot = v.reaction === 'hot';
                    return (
                    <div
                      key={v.id}
                      className={cn(
                        'flex w-full items-center gap-3 px-5 py-3 border-b last:border-0 transition-colors',
                        isHot
                          ? 'border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/15'
                          : v.reaction
                            ? 'bg-primary/5 hover:bg-primary/10'
                            : 'hover:bg-secondary/40'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => { onClose(); navigate(`/users/${v.id}`); }}
                        className="flex flex-1 min-w-0 items-center gap-3 text-left"
                      >
                        <div className="relative shrink-0">
                          {v.avatar ? (
                            <img src={resolveServerUrl(v.avatar)} alt={v.name} className={cn('h-9 w-9 rounded-full object-cover', isHot && 'ring-2 ring-amber-400')} />
                          ) : (
                            <div className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold', isHot && 'ring-2 ring-amber-400')}>
                              {v.name.charAt(0)}
                            </div>
                          )}
                          {v.reaction && (
                            <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-background bg-background text-[11px] leading-none">
                              {isHot ? HOT_HEART : (REACTION_EMOJI[v.reaction] ?? '💜')}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="min-w-0 truncate text-sm font-medium hover:underline">{v.name}</p>
                            {isHot && (
                              <span className="shrink-0 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                                {HOT_HEART} Coração Quente
                              </span>
                            )}
                          </div>
                          {v.comment ? (
                            <p className="truncate text-xs text-foreground/80">💬 "{v.comment}"</p>
                          ) : isHot ? (
                            <p className="text-xs font-medium text-amber-600">Mandou um Coração Quente 🔥</p>
                          ) : v.reaction ? (
                            <p className="text-xs text-brand-pink">Curtiu seu story</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">{formatTime(v.viewedAt)}</p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => { onClose(); navigate(`/chat?userId=${v.id}`); }}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 active:scale-95 transition-all"
                      >
                        <Send className="h-3.5 w-3.5" /> Mensagem
                      </button>
                    </div>
                    );
                  })
                )
              ) : (
                comments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 px-5 py-3 border-b last:border-0">
                      {c.commenter.avatar ? (
                        <img src={resolveServerUrl(c.commenter.avatar)} alt={c.commenter.name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold shrink-0">
                          {c.commenter.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.commenter.name}</p>
                        <p className="text-sm text-muted-foreground">{c.text}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{formatTime(c.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Página principal Stories ─────────────────────────────────────────────────
export default function Stories() {
  useDocumentTitle('Stories');
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate  = useNavigate();
  const isPremium = hasPremiumAccess(user);
  const { requireFields } = useProfileGate();

  const [myStories,    setMyStories]    = useState<MyStory[]>([]);
  const bottomInset = useBottomChromeInset();
  const [myStory,      setMyStory]      = useState<MyStory | null | undefined>(undefined); // compat
  const [feed,         setFeed]         = useState<FeedStory[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [viewerIdx,    setViewerIdx]    = useState<number | null>(null);
  const [previewIdx,   setPreviewIdx]   = useState<number | null>(null); // preview own stories
  const [ownMuted, setOwnMuted] = useState(true); // som ao revisar os próprios stories
  const [statsStoryId, setStatsStoryId] = useState<string | null>(null);
  const [statsOpen,    setStatsOpen]    = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null); // storyId being deleted
  const [paywallOpen,  setPaywallOpen]  = useState(false);
  const [returnTo,     setReturnTo]     = useState<string | null>(null); // rota de retorno ao fechar (ex.: /feed)

  // Composer de story de texto
  const [textOpen,  setTextOpen]  = useState(false);
  const [storyText, setStoryText] = useState('');
  const [storyBg,   setStoryBg]   = useState(STORY_BACKGROUNDS[0].id);

  // Overlays de tela cheia desta página (o visualizador de stories trava por
  // conta própria, já que só existe enquanto está aberto).
  useBodyScrollLock(previewIdx !== null || statsOpen || textOpen);

  // Editor de mídia — texto por cima da foto/vídeo (estilo Instagram)
  const [editorFile,    setEditorFile]    = useState<File | null>(null);
  const [editorUrl,     setEditorUrl]     = useState<string | null>(null);
  const [editorIsVideo, setEditorIsVideo] = useState(false);
  const [ovText,  setOvText]  = useState('');
  const [ovColor, setOvColor] = useState<string>(OVERLAY_COLORS[0]);
  const [ovX,     setOvX]     = useState(50);   // posição X do texto em % (arrastável)
  const [ovY,     setOvY]     = useState(50);   // posição Y do texto em %
  const [ovSize,  setOvSize]  = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const editorBoxRef = useRef<HTMLDivElement>(null);       // caixa de preview da mídia
  const [editorBoxW, setEditorBoxW] = useState(0);         // largura medida (fonte proporcional)
  const draggingOv = useRef(false);

  const fileRef    = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef   = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mineRes, feedRes] = await Promise.allSettled([
      storiesService.getMyStory(),
      storiesService.getFeed(),
    ]);
    if (mineRes.status === 'fulfilled') {
      const list = (mineRes.value as any).stories ?? (mineRes.value.story ? [mineRes.value.story] : []);
      setMyStories(list);
      setMyStory(mineRes.value.story ?? null);
    } else {
      setMyStories([]);
      setMyStory(null);
    }
    if (feedRes.status === 'fulfilled') setFeed(feedRes.value.stories);
    else toast({ title: 'Erro ao carregar stories', variant: 'destructive' });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleOpenStory = useCallback(async (idx: number) => {
    if (!isPremium) {
      setPaywallOpen(true);
      return;
    }
    const ok = await requireFields(['photo', 'birthDate']);
    if (!ok) return;
    setViewerIdx(idx);
  }, [isPremium, requireFields]);

  // Auto-abre o story certo ao chegar por link:
  //  ?open=<id>   → story de outro autor (vindo da barra no Feed) → viewer
  //  ?storyId=<id> → seu próprio story (vindo de notificação) → preview
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (loading || autoOpenedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    const ownId = params.get('storyId');
    if (!openId && !ownId) return;
    autoOpenedRef.current = true;
    // Aberto a partir do feed → ao fechar o story, volta pro feed (não fica em /stories)
    if (params.get('from') === 'feed') setReturnTo('/feed');
    window.history.replaceState({}, '', '/stories');
    if (ownId) {
      const ownIdx = myStories.findIndex((s) => s.id === ownId);
      if (ownIdx >= 0) { setPreviewIdx(ownIdx); return; }
    }
    if (openId) {
      const idx = feed.findIndex((s) => s.id === openId);
      if (idx >= 0) {
        // Amostra grátis vinda da barra do feed: abre mesmo sem premium (o viewer
        // trava ao avançar). Caso normal segue pelo gate do handleOpenStory.
        if (!isPremium && params.get('taste') === '1') setViewerIdx(idx);
        else void handleOpenStory(idx);
      }
    }
  }, [loading, feed, myStories, handleOpenStory, isPremium]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    // Validação de vídeo máx 30s via duration
    if (file.type.startsWith('video/')) {
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = URL.createObjectURL(file);
        v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
        v.onerror = () => resolve(0);
      });
      if (duration > 30) {
        toast({ title: 'Vídeo muito longo', description: 'O vídeo deve ter no máximo 30 segundos.', variant: 'destructive' });
        return;
      }
    }
    // Abre o editor para o usuário adicionar texto sobre a mídia antes de publicar.
    if (editorUrl) URL.revokeObjectURL(editorUrl);
    setEditorFile(file);
    setEditorUrl(URL.createObjectURL(file));
    setEditorIsVideo(file.type.startsWith('video/'));
    setOvText('');
    setOvColor(OVERLAY_COLORS[0]);
    setOvX(50);
    setOvY(50);
    setOvSize('md');
  };

  const closeEditor = () => {
    if (editorUrl) URL.revokeObjectURL(editorUrl);
    setEditorFile(null);
    setEditorUrl(null);
    setEditorIsVideo(false);
    setOvText('');
  };

  const handlePublishMedia = async () => {
    if (!editorFile) return;
    setUploading(true);
    try {
      const media = await profileService.uploadMedia(editorFile, { isPrivate: false, source: 'post' });
      const text = ovText.trim();
      await storiesService.create(String(media.id), text ? { text, textOverlay: { x: ovX, y: ovY, color: ovColor, size: ovSize } } : undefined);
      toast({ title: '✨ Story publicado!', description: 'Expira em 24 horas.' });
      closeEditor();
      await load();
    } catch (err) {
      handleUploadError(err);
    } finally {
      setUploading(false);
    }
  };

  // Mede a largura da caixa de preview do editor (para a fonte proporcional do overlay).
  useEffect(() => {
    if (!editorUrl) return;
    const el = editorBoxRef.current;
    if (!el) return;
    const update = () => setEditorBoxW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editorUrl]);

  // Arrastar o texto livremente pela mídia (pointer = mouse + toque).
  const onOvPointerDown = (e: React.PointerEvent) => {
    draggingOv.current = true;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  };
  const onOvPointerMove = (e: React.PointerEvent) => {
    if (!draggingOv.current) return;
    const box = editorBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    setOvX(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
    setOvY(Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)));
  };
  const onOvPointerUp = () => { draggingOv.current = false; };

  const handleCreateText = async () => {
    const text = storyText.trim();
    if (!text) return;
    setUploading(true);
    try {
      await storiesService.createText(text, storyBg);
      toast({ title: '✨ Story publicado!', description: 'Expira em 24 horas.' });
      setTextOpen(false);
      setStoryText('');
      setStoryBg(STORY_BACKGROUNDS[0].id);
      await load();
    } catch (err) {
      handleUploadError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (storyId: string) => {
    setDeleting(storyId);
    try {
      await storiesService.remove(storyId);
      toast({ title: 'Story removido' });
      await load();
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const handleUploadError = (err: unknown) => {
    const msg = (err as any)?.response?.data?.message ?? '';
    if (msg.includes('max_stories') || msg.includes('10 stories')) {
      toast({ title: 'Limite atingido', description: 'Você já tem 10 stories ativos. Apague um antes de postar.', variant: 'destructive' });
    } else {
      toast({ title: 'Erro ao publicar story', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-3 py-4 sm:px-4 sm:py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Stories</h1>
          <p className="text-sm text-muted-foreground">Fotos, vídeos e textos que expiram em 24h</p>
        </div>
      </div>

      {/* ── Meu Story ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Meus Stories {myStories.length > 0 && <span className="text-brand-pink ml-1">{myStories.length}</span>}
          </h2>
          {/* Botões de adicionar sempre visíveis */}
          {myStories.length > 0 && (
            <div className="flex items-center gap-2">
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 text-xs text-brand-pink hover:text-brand-pink/80 font-medium disabled:opacity-40">
                <Camera className="h-3.5 w-3.5" /> Câmera
              </button>
              <button type="button" disabled={uploading} onClick={() => galleryRef.current?.click()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
                <ImageIcon className="h-3.5 w-3.5" /> Galeria
              </button>
              <button type="button" disabled={uploading} onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
                <Camera className="h-3.5 w-3.5" /> Vídeo
              </button>
              <button type="button" disabled={uploading} onClick={() => setTextOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
                <span className="text-[13px] leading-none font-bold">Aa</span> Texto
              </button>
              {uploading && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
            </div>
          )}
        </div>

        {myStories.length > 0 ? (
          /* Stories ativos — grid de thumbnails */
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {myStories.map((s, i) => (
              <div key={s.id} className="relative group">
                {/* Thumbnail clicável para preview */}
                <button
                  type="button"
                  onClick={() => setPreviewIdx(i)}
                  className="relative w-full aspect-[9/16] overflow-hidden rounded-xl bg-black block"
                >
                  <StoryContent story={s} thumb />
                  {/* Overlay com stats */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-2">
                    <span className="flex items-center gap-0.5 text-[10px] text-white/80">
                      <Eye className="h-3 w-3" />{s.viewCount}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-white/80">
                      <Heart className="h-3 w-3" />{s.likeCount ?? 0}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-white/80">
                      <MessageCircle className="h-3 w-3" />{s.commentCount}
                    </span>
                    <span className="ml-auto text-[9px] text-white/60 truncate">{timeLeft(s.expiresAt)}</span>
                  </div>
                </button>
                {/* Ações: stats + apagar */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => { setStatsStoryId(s.id); setStatsOpen(true); }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    title="Estatísticas"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={deleting === s.id}
                    onClick={() => void handleDelete(s.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500/80 disabled:opacity-40"
                    title="Apagar"
                  >
                    {deleting === s.id
                      ? <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                      : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Criar story */
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-fuchsia-500/10 to-violet-600/15 p-6 text-center space-y-4 shadow-[0_8px_32px_rgba(168,85,247,0.18)]">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-lg">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold">Poste um momento quente 🔥</p>
              <p className="text-sm text-muted-foreground mt-1">
                Foto, vídeo de até 30s ou só texto · fica 24h no ar · aparece para quem combina com você
              </p>
            </div>
            <div className="flex justify-center gap-3 flex-wrap">
              <Button size="sm" variant="outline" className="gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4" /> Câmera
              </Button>
              <Button size="sm" variant="outline" className="gap-2" disabled={uploading} onClick={() => galleryRef.current?.click()}>
                <ImageIcon className="h-4 w-4" /> Galeria
              </Button>
              <Button size="sm" variant="outline" className="gap-2" disabled={uploading} onClick={() => videoRef.current?.click()}>
                <Camera className="h-4 w-4" /> Vídeo
              </Button>
              <Button size="sm" className="gap-2 bg-gradient-to-r from-primary to-violet-600" disabled={uploading} onClick={() => setTextOpen(true)}>
                {uploading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <span className="font-bold">Aa</span>}
                {uploading ? 'Enviando...' : 'Texto'}
              </Button>
            </div>
          </div>
        )}
        {/* Inputs de arquivo (sempre presentes) */}
        <input ref={fileRef}    type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/*,video/*"               className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
        <input ref={videoRef}   type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
      </section>

      {/* ── Stories de interesse ───────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Stories de interesse
          {feed.length > 0 && <span className="ml-2 text-brand-pink">{feed.length}</span>}
        </h2>

        {feed.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum story disponível no momento.<br />
              Quando perfis compatíveis publicarem, aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {feed.map((story, i) => (
              <button
                key={story.id}
                type="button"
                onClick={() => void handleOpenStory(i)}
                className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black group"
              >
                {/* Mídia — borrada só nos NÃO-vistos, p/ gerar curiosidade */}
                <div className={cn('absolute inset-0', !story.viewed && 'scale-110 blur-xl brightness-[0.8]')}>
                  <StoryContent story={story} thumb />
                </div>

                {/* Gradient */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* Chamada "toque para ver" — só nos não-vistos */}
                {!story.viewed && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm ring-1 ring-white/25 transition-transform group-hover:scale-110 group-active:scale-95">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-[10px] font-semibold leading-tight text-white/90 drop-shadow">Toque para ver</span>
                  </div>
                )}

                {/* Avatar ring */}
                <div className={cn(
                  'absolute top-2 left-2 h-8 w-8 rounded-full overflow-hidden ring-2 ring-offset-1 ring-offset-black',
                  story.viewed ? 'ring-white/40' : 'ring-primary'
                )}>
                  {story.author.avatar ? (
                    <img src={resolveServerUrl(story.author.avatar)} alt={story.author.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-secondary text-[10px] font-bold">
                      {story.author.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name */}
                <p className="absolute bottom-2 left-2 right-2 text-[10px] font-semibold text-white truncate">
                  {story.author.name}
                </p>

                {/* Viewed indicator */}
                {story.viewed && (
                  <div className="absolute top-2 right-2 flex items-center justify-center h-5 w-5 rounded-full bg-white/20">
                    <Eye className="h-3 w-3 text-white/80" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Preview dos próprios stories */}
      {previewIdx !== null && myStories.length > 0 && (() => {
        const s = myStories[previewIdx];
        if (!s) return null;
        const goOwn = (delta: number) => {
          const next = previewIdx + delta;
          if (next < 0 || next >= myStories.length) setPreviewIdx(null);
          else setPreviewIdx(next);
        };
        return (
          <div
            className="fixed inset-0 z-[9995] flex flex-col bg-black"
            style={{ paddingBottom: bottomInset > 0 ? bottomInset : 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Barras de progresso */}
            <div className="flex gap-1 px-3 pt-3 pb-2">
              {myStories.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                  <div className="h-full bg-white" style={{ width: i < previewIdx ? '100%' : i === previewIdx ? '100%' : '0%' }} />
                </div>
              ))}
            </div>
            {/* Header */}
            <div className="flex items-center gap-3 px-3 pb-2">
              {user?.avatar ? (
                <img src={resolveServerUrl(user.avatar)} alt={user?.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white/60" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm">
                  {user?.name?.charAt(0) ?? '?'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                <p className="text-xs text-white/60">{timeLeft(s.expiresAt)}</p>
              </div>
              {s.mimeType.startsWith('video/') && (
                <button
                  type="button"
                  onClick={() => setOwnMuted((v) => !v)}
                  className="text-white/80 hover:text-white p-1"
                  aria-label={ownMuted ? 'Ativar som' : 'Silenciar'}
                >
                  {ownMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
              )}
              <button type="button" onClick={() => setPreviewIdx(null)} className="text-white/80 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Mídia */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              {!s.mediaUrl && s.text ? (
                <div key={s.id} className="flex h-full w-full items-center justify-center px-8 text-center" style={{ background: backgroundCss(s.background) }}>
                  <p className="text-2xl font-bold leading-snug text-white break-words">{s.text}</p>
                </div>
              ) : s.mimeType.startsWith('video/') ? (
                <video key={s.id} src={resolveServerUrl(s.mediaUrl || '')} className="h-full w-full object-cover" autoPlay muted={ownMuted} playsInline onEnded={() => goOwn(1)} />
              ) : (
                <img key={s.id} src={resolveServerUrl(s.mediaUrl || '')} alt="" className="h-full w-full object-cover" />
              )}
              <button type="button" className="absolute left-0 top-0 h-full w-1/3" onClick={() => goOwn(-1)} />
              <button type="button" className="absolute right-0 top-0 h-full w-1/3" onClick={() => goOwn(1)} />
            </div>
            {/* Footer */}
            <div className="flex items-center justify-center gap-5 border-t border-white/10 bg-black/80 px-4 py-3">
              <button type="button" onClick={() => { setPreviewIdx(null); setStatsStoryId(s.id); setStatsOpen(true); }} className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
                <Eye className="h-4 w-4" /> {s.viewCount}
              </button>
              <button type="button" onClick={() => { setPreviewIdx(null); setStatsStoryId(s.id); setStatsOpen(true); }} className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
                <Heart className="h-4 w-4" /> {s.likeCount ?? 0}
              </button>
              <button type="button" onClick={() => { setPreviewIdx(null); setStatsStoryId(s.id); setStatsOpen(true); }} className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
                <MessageCircle className="h-4 w-4" /> {s.commentCount}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Viewer fullscreen */}
      {viewerIdx !== null && (
        <StoryViewer
          stories={feed}
          startIndex={viewerIdx}
          myUserId={user?.id || ''}
          isPremium={isPremium}
          onClose={() => { setViewerIdx(null); if (returnTo) navigate(returnTo); else void load(); }}
        />
      )}

      {/* Stats modal */}
      {statsOpen && (statsStoryId ?? myStory?.id) && (
        <StatsModal
          storyId={(statsStoryId ?? myStory?.id)!}
          isPremium={isPremium}
          onClose={() => { setStatsOpen(false); setStatsStoryId(null); }}
          onUpgrade={() => { setStatsOpen(false); setStatsStoryId(null); navigate('/subscriptions'); }}
        />
      )}

      {/* Editor de mídia — texto por cima da foto/vídeo (estilo Instagram) */}
      {editorUrl && (
        <div
          className="fixed inset-0 z-[9997] flex flex-col bg-black/95"
          style={{ paddingBottom: bottomInset > 0 ? bottomInset : 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* topo */}
          <div className="flex shrink-0 items-center justify-between p-4">
            <button type="button" onClick={() => { if (!uploading) closeEditor(); }} disabled={uploading} className="text-white/80 hover:text-white">
              <X className="h-6 w-6" />
            </button>
            <span className="text-sm text-white/70">Adicione um texto</span>
            <button
              type="button"
              onClick={() => void handlePublishMedia()}
              disabled={uploading}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? 'Publicando...' : 'Publicar'}
            </button>
          </div>

          {/* preview com overlay ao vivo */}
          <div className="relative mx-auto flex w-full max-w-sm flex-1 items-center justify-center overflow-hidden px-4">
            <div ref={editorBoxRef} className="relative aspect-[9/16] max-h-full w-full touch-none overflow-hidden rounded-2xl bg-black">
              {editorIsVideo ? (
                <video src={editorUrl} className="h-full w-full object-cover" autoPlay muted loop playsInline />
              ) : (
                <img src={editorUrl} alt="" className="h-full w-full object-cover" />
              )}
              {ovText.trim() ? (
                <div
                  className="absolute cursor-move touch-none select-none"
                  style={{ left: `${ovX}%`, top: `${ovY}%`, transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: '86%' }}
                  onPointerDown={onOvPointerDown}
                  onPointerMove={onOvPointerMove}
                  onPointerUp={onOvPointerUp}
                  onPointerCancel={onOvPointerUp}
                >
                  <p
                    className="text-center font-bold leading-snug break-words [text-shadow:_0_2px_8px_rgba(0,0,0,0.85)]"
                    style={{ color: ovColor, fontSize: Math.max(12, editorBoxW * OVERLAY_SIZE_FRAC[ovSize]) }}
                  >
                    {ovText}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* controles */}
          <div className="shrink-0 space-y-3 p-4">
            <textarea
              value={ovText}
              onChange={(e) => setOvText(e.target.value.slice(0, 280))}
              placeholder="Escreva um texto sobre a mídia (opcional)"
              rows={2}
              className="w-full resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-primary/50"
            />
            {ovText.trim() ? (
              <p className="text-center text-[11px] text-white/50">✋ Arraste o texto sobre a mídia para posicionar</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* tamanho da fonte */}
              <div className="flex items-center gap-1">
                {(['sm', 'md', 'lg', 'xl'] as const).map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setOvSize(s)}
                    aria-label={`Tamanho ${s}`}
                    className={cn('flex h-8 w-8 items-center justify-center rounded-full font-bold leading-none transition-colors', ovSize === s ? 'bg-primary text-white' : 'bg-white/10 text-white/70 hover:bg-white/20')}
                    style={{ fontSize: 11 + i * 3 }}
                  >
                    A
                  </button>
                ))}
              </div>
              {/* cor */}
              <div className="flex gap-1.5">
                {OVERLAY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setOvColor(c)}
                    className={cn('h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-black transition-all', ovColor === c ? 'scale-110 ring-white' : 'ring-transparent')}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Composer de story de texto */}
      {textOpen && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black/70 p-4" onClick={() => !uploading && setTextOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Story de texto</h3>
              <button type="button" onClick={() => setTextOpen(false)} disabled={uploading}><X className="h-5 w-5" /></button>
            </div>

            {/* Preview */}
            <div
              className="mb-4 flex aspect-[9/16] max-h-72 w-full items-center justify-center overflow-hidden rounded-2xl px-6 text-center"
              style={{ background: backgroundCss(storyBg) }}
            >
              <p className="text-xl font-bold leading-snug text-white break-words">
                {storyText.trim() || 'Escreva algo...'}
              </p>
            </div>

            <textarea
              value={storyText}
              onChange={(e) => setStoryText(e.target.value.slice(0, 280))}
              placeholder="O que você quer dizer?"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="mb-3 mt-1 text-right text-[11px] text-muted-foreground">{storyText.length}/280</div>

            {/* Paleta de fundos */}
            <div className="mb-4 flex flex-wrap gap-2">
              {STORY_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setStoryBg(bg.id)}
                  title={bg.label}
                  className={cn('h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all', storyBg === bg.id ? 'ring-primary scale-110' : 'ring-transparent')}
                  style={{ background: bg.css }}
                />
              ))}
            </div>

            <Button
              className="w-full gap-2 bg-gradient-to-r from-primary to-violet-600"
              disabled={uploading || !storyText.trim()}
              onClick={() => void handleCreateText()}
            >
              {uploading
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Sparkles className="h-4 w-4" />}
              {uploading ? 'Publicando...' : 'Publicar story'}
            </Button>
          </div>
        </div>
      )}

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
