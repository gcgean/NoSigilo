import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NomePerfil from '@/components/NomePerfil';
import { ehFotoHeic, heicParaJpeg, FOTO_NAO_ABRE } from '@/utils/mediaCompression';
import { createPortal } from 'react-dom';
import {
  Camera, Eye, MessageCircle, Trash2, X, Send, Heart,
  Lock, Crown, Sparkles, ImageIcon, Volume2, VolumeX,
  Star, Pin, Search, Check, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { storiesService, profileService, tokenService, usosTokensService } from '@/services/api';
import SemTokensDialog from '@/components/SemTokensDialog';
import ComprarTokens from '@/components/ComprarTokens';
import type { StoryAudience, StoryFavoriteCandidate } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { PHOTO_REACTIONS, REACTION_EMOJI } from '@/lib/reactions';
import { STORY_BACKGROUNDS, backgroundCss } from '@/lib/storyBackgrounds';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import BackToTop from '@/components/BackToTop';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const HOT_HEART = '❤️‍🔥'; // Coração Quente (reação especial que consome 1 token)

// Como ganhar tokens de graça (mesmos valores de TOKEN_RULES no backend).
// Pontos por publicar (e o Top do Dia) só valem para mulher e casal.
const GANHAR_TOKENS = [
  { icon: '📅', texto: 'Entrar todo dia', pontos: '+5', conteudo: false },
  { icon: '❤️', texto: 'Curtir', pontos: '+1', conteudo: false },
  { icon: '💬', texto: 'Comentar', pontos: '+3', conteudo: false },
  { icon: '📝', texto: 'Post', pontos: '+5', conteudo: true },
  { icon: '📸', texto: 'Story', pontos: '+8', conteudo: true },
  { icon: '🖼️', texto: 'Foto', pontos: '+10', conteudo: true },
  { icon: '🏆', texto: 'Top do Dia', pontos: 'até +30', conteudo: true },
];
const ganhaPorConteudo = (gender: unknown) => {
  const g = String(gender || '').trim().toLowerCase();
  return g === 'mulher' || g.startsWith('casal');
};

// Três listas diferentes convivem nesta tela, e confundi-las é fácil. Em uma
// frase cada:
//
//   Favoritos (estrela verde)  — quem PODE VER o story que eu marcar como
//                                restrito. Sai do meu lado, afeta os outros.
//   Fixados   (alfinete)       — quem eu QUERO VER primeiro. Só muda a ordem
//                                da minha fileira; ninguém fica sabendo.
//   Curtidos                   — quem eu curti. É o "seguir" deste app, e é
//                                de onde saem os candidatos a favorito.
type FiltroStories = 'todos' | 'fixados' | 'curtidos';

const CHAVE_FILTRO = 'nosigilo:stories-filtro';

/** O filtro escolhido sobrevive à navegação — quem prefere só os fixados não
 *  quer reescolher a cada visita. Vale por navegador, não por conta: é
 *  preferência de leitura, não dado de perfil. */
function leFiltroSalvo(): FiltroStories {
  try {
    const v = localStorage.getItem(CHAVE_FILTRO);
    return v === 'fixados' || v === 'curtidos' ? v : 'todos';
  } catch {
    return 'todos';
  }
}

/** Estrela verde do Instagram: marca o story que só os favoritos do autor
 *  veem. No feed ela só aparece para quem ESTÁ na lista — é a forma de a
 *  pessoa entender por que está vendo aquilo. */
function SeloFavoritos({ className }: { className?: string }) {
  return (
    <span
      title="Story só para favoritos"
      className={cn(
        'flex items-center justify-center rounded-full bg-[#22c55e] text-white shadow ring-1 ring-black/30',
        className ?? 'h-4 w-4',
      )}
    >
      <Star className="h-2.5 w-2.5 fill-current" />
    </span>
  );
}

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
  audience?: StoryAudience;
  createdAt: string; expiresAt: string;
  viewCount: number; commentCount: number; likeCount: number;
};

type FeedStory = {
  id: string; mediaUrl: string | null; mimeType: string;
  text?: string | null; background?: string | null; textOverlay?: TextOverlay | null;
  audience?: StoryAudience;
  createdAt: string; expiresAt: string; viewed: boolean;
  likeCount: number; likedByMe: boolean; myReaction?: string | null;
  isVideoLocked?: boolean;
  author: {
    id: string; name: string; gender: string | null; avatar: string | null;
    age: number | null; partnerAge: number | null;
    city: string | null; state: string | null; bio: string | null;
    fetiches: string[]; intentions: string[];
    distanceKm: number | null;
    likedByMe?: boolean;
    pinnedByMe?: boolean;
  };
};

type Viewer   = { id: string; name: string; avatar: string | null; viewedAt: string; reaction: string | null; comment: string | null };
type Fan      = { id: string; name: string; avatar: string | null; city: string | null; state: string | null; pinnedAt: string };
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
/**
 * Piso de recuo para o Chrome no iOS.
 *
 * O diagnóstico em aparelho real mostrou que ali `innerHeight` é IGUAL a
 * `visualViewport.height` (o Chrome sobrepõe a própria barra sem encolher a
 * viewport) e `env(safe-area-inset-bottom)` resolve como 0. Resultado: nem a
 * conta abaixo nem o CSS davam qualquer folga, e o conteúdo ficava sob o
 * indicador de home. Safari e Android não passam por aqui — lá as duas fontes
 * já funcionam.
 *
 * 34px é a altura do indicador de home nos iPhones com tela cheia; em modelos
 * com botão físico (tela < 812pt) não existe indicador e o piso não se aplica.
 *
 * NÃO validado em aparelho real ainda — é uma compensação defensiva baseada no
 * que o diagnóstico mediu.
 */
function pisoDoChromeIOS(): number {
  if (typeof navigator === 'undefined' || typeof screen === 'undefined') return 0;
  const ehChromeIOS = /CriOS/.test(navigator.userAgent);
  if (!ehChromeIOS) return 0;
  const temIndicadorDeHome = Math.max(screen.width, screen.height) >= 812;
  return temIndicadorDeHome ? 34 : 0;
}

/**
 * Recuo de baixo dos overlays de tela cheia.
 *
 * No Safari do iPhone (navegador, não o app instalado) a barra do Safari já
 * fica embaixo e o risquinho de home fica atrás dela; somar a área segura ali
 * deixava uma faixa preta vazia entre a caixa de resposta e a barra (relato de
 * 17/10/2026). No app instalado e nos outros navegadores segue a área segura.
 */
function recuoInferior(bottomInset: number): number | string {
  if (bottomInset > 0) return bottomInset;
  if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
    const ua = navigator.userAgent;
    const safariIPhone = /iPhone|iPad/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    const instalado = (navigator as Navigator & { standalone?: boolean }).standalone === true
      || window.matchMedia?.('(display-mode: standalone)').matches;
    if (safariIPhone && !instalado) return 4;
  }
  return 'env(safe-area-inset-bottom, 0px)';
}

function useBottomChromeInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const piso = pisoDoChromeIOS();
    const update = () => {
      const visivel = vv ? vv.height : window.innerHeight;
      const medido = Math.max(0, Math.round(window.innerHeight - visivel));
      setInset(Math.max(medido, piso));
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

/** Distância, em km, até onde a cidade do autor ainda é exibida no story.
 *  50 km cobre região metropolitana (Fortaleza→Maracanaú, Recife→Olinda) sem
 *  alcançar outra praça (Fortaleza→Sobral são 230 km, Recife→Caruaru 130). */
const RAIO_CIDADE_VISIVEL_KM = 50;

const normalizarTexto = (v?: string | null) =>
  String(v ?? '').trim().toLowerCase();

/**
 * Linha abaixo do nome no story: gênero sempre, cidade SÓ quando for perto.
 *
 * A ordenação regional já traz quem é da mesma cidade primeiro, então nos
 * primeiros stories o nome da cidade reforça o senso de comunidade local.
 * Nos de fora ele faria o oposto — ler "São Paulo" num app cuja promessa é
 * proximidade passa a mensagem de que não há ninguém por perto. Por isso a
 * cidade some quando está longe, em vez de anunciar a distância.
 *
 * Omitir não é enganar: é exatamente o que a tela mostrava antes para todos.
 */
function linhaDeIdentidadeDoStory(
  autor: { gender: string | null; city: string | null; state: string | null; distanceKm: number | null },
  espectador: { city?: string | null; state?: string | null }
) {
  const genero = String(autor.gender ?? '').trim();
  const cidade = String(autor.city ?? '').trim();
  const uf = String(autor.state ?? '').trim();
  if (!cidade) return genero;

  const mesmaCidade =
    normalizarTexto(cidade) === normalizarTexto(espectador.city) &&
    // Compara a UF só quando os dois lados a têm — perfil antigo pode não ter.
    (!uf || !espectador.state || normalizarTexto(uf) === normalizarTexto(espectador.state));
  const dentroDoRaio =
    autor.distanceKm !== null && autor.distanceKm <= RAIO_CIDADE_VISIVEL_KM;

  if (!mesmaCidade && !dentroDoRaio) return genero;

  const local = [cidade, uf].filter(Boolean).join(', ');
  return [genero, local].filter(Boolean).join(' - ');
}

// ─── Story Viewer (fullscreen) ────────────────────────────────────────────────
/**
 * Escolha de quem entra na lista de favoritos.
 *
 * Abre em dois lugares e faz a mesma coisa nos dois: no cabeçalho da tela
 * (para mexer na lista com calma) e dentro do composer (para ajustar na hora
 * de postar, como no Instagram). Por isso ela guarda a seleção em estado
 * local e só devolve ao pai no "Salvar" — quem abriu decide o que fazer com
 * a lista: gravar direto ou levar junto com o story.
 *
 * O universo é quem o usuário curtiu. Se ele não curtiu ninguém ainda, não há
 * o que escolher, e a tela diz isso em vez de mostrar uma lista vazia sem
 * explicação.
 */
function FavoritesPicker({
  open,
  onClose,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (ids: string[]) => void | Promise<void>;
  salvando?: boolean;
}) {
  const { toast } = useToast();
  const [carregando, setCarregando] = useState(true);
  const [candidatos, setCandidatos] = useState<StoryFavoriteCandidate[]>([]);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setCarregando(true);
    void storiesService.getFavorites()
      .then((res) => {
        if (!vivo) return;
        setCandidatos(res.candidates);
        setEscolhidos(new Set(res.favoriteIds));
      })
      .catch(() => {
        if (!vivo) return;
        toast({ title: 'Erro ao carregar seus favoritos', variant: 'destructive' });
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [open, toast]);

  if (!open) return null;

  const alterna = (id: string) => {
    setEscolhidos((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? candidatos.filter((c) => c.name.toLowerCase().includes(termo) || (c.city || '').toLowerCase().includes(termo))
    : candidatos;

  return createPortal((
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-background sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <SeloFavoritos className="h-5 w-5" />
            <div>
              <h3 className="font-semibold leading-tight">Favoritos</h3>
              <p className="text-[11px] text-muted-foreground">Só eles veem os stories marcados com a estrela</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar perfil"
              className="w-full rounded-xl border border-border bg-secondary/40 py-2 pl-9 pr-3 text-[16px] outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {carregando ? (
            <div className="flex justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : candidatos.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Você ainda não curtiu nenhum perfil.<br />
              Curta quem você quer acompanhar — os favoritos saem dessa lista.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum perfil com esse nome.</p>
          ) : (
            visiveis.map((c) => {
              const marcado = escolhidos.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => alterna(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                    marcado ? 'bg-[#22c55e]/10' : 'hover:bg-secondary/50',
                  )}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                    {c.avatar ? (
                      <img src={resolveServerUrl(c.avatar)} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold">{c.name.charAt(0)}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    {(c.city || c.state) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[c.city, c.state].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    marcado ? 'border-[#22c55e] bg-[#22c55e] text-white' : 'border-border',
                  )}>
                    {marcado && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-4">
          <Button
            className="w-full bg-[#22c55e] text-white hover:bg-[#22c55e]/90"
            disabled={salvando || carregando}
            onClick={() => void onSave(Array.from(escolhidos))}
          >
            {salvando
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : `Salvar (${escolhidos.size})`}
          </Button>
        </div>
      </div>
    </div>
  ), document.body);
}

// Respostas rápidas: aparecem quando a pessoa toca em "Responder" e vão direto
// para o chat com um toque (é o que mais faz story virar conversa).
const RESPOSTAS_RAPIDAS = ['🔥', '😍', '😈', '💦', '👏', '😮'];

function StoryViewer({
  stories,
  startIndex,
  myUserId,
  modoAmostra = false,
  onClose,
  onTogglePin,
}: {
  stories: FeedStory[];
  startIndex: number;
  myUserId: string;
  /** Não assinante vendo os mais curtidos: no fim, leva para os planos. */
  modoAmostra?: boolean;
  onClose: () => void;
  onTogglePin: (autorId: string) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const { user: espectador } = useAuth();
  const bottomInset = useBottomChromeInset();
  useBodyScrollLock(true); // o visualizador só existe montado, então trava sempre
  // Stories agrupados por perfil, como no Instagram: as barras do topo mostram
  // só os stories da pessoa atual; tocar avança dentro do perfil e deslizar
  // pula de perfil. Antes era uma fila única (149 stories de 96 perfis = 149
  // tracinhos no topo e nenhum jeito de pular quem não interessa).
  // Perfis na ordem da fileira; dentro do perfil, do mais antigo ao mais novo.
  const grupos = useMemo(() => {
    const ordem: string[] = [];
    const porAutor = new Map<string, FeedStory[]>();
    for (const st of stories) {
      const a = st.author.id;
      if (!porAutor.has(a)) { porAutor.set(a, []); ordem.push(a); }
      porAutor.get(a)!.push(st);
    }
    const lista = ordem.map((a) => [...porAutor.get(a)!].sort((x, y) => x.createdAt.localeCompare(y.createdAt)));
    // Perfis com story ainda não visto vêm primeiro (a ordem da fileira continua dentro de cada bloco).
    return [...lista.filter((g) => g.some((st) => !st.viewed)), ...lista.filter((g) => g.every((st) => st.viewed))];
  }, [stories]);
  // Vistos nesta abertura (o "viewed" do servidor só atualiza no próximo load).
  const vistosAqui = useRef(new Set<string>());
  // Ao entrar num perfil, começa pelo primeiro story que a pessoa ainda não viu.
  const inicioDoGrupo = useCallback((g: FeedStory[]) => {
    const i = g.findIndex((st) => !st.viewed && !vistosAqui.current.has(st.id));
    return i >= 0 ? i : 0;
  }, []);
  const [pos, setPos] = useState(() => {
    const alvo = stories[startIndex];
    const gi = Math.max(0, grupos.findIndex((g) => g.some((st) => st.id === alvo?.id)));
    const g = grupos[gi] ?? [];
    // Sempre retoma do primeiro story ainda não visto do perfil (mesmo tocando
    // num que já foi visto); se viu todos, abre no story tocado.
    const temNaoVisto = g.some((st) => !st.viewed);
    const si = temNaoVisto ? inicioDoGrupo(g) : Math.max(0, g.findIndex((st) => st.id === alvo?.id));
    return { gi, si };
  });
  // Direção da última troca de perfil (anima a entrada como o "cubo" do Instagram).
  const [dirEntrada, setDirEntrada] = useState<0 | 1 | -1>(0);
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
  const [paused, setPaused] = useState(false); // segurando o dedo na tela
  const [digitando, setDigitando] = useState(false); // respondendo: o story espera
  const [oculto, setOculto] = useState(false); // app em segundo plano
  const [coracaoGrande, setCoracaoGrande] = useState(false);
  const seguraCoracao = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saldo de tokens (Coração Quente custa 1). null = ainda não sabemos.
  const [saldoTokens, setSaldoTokens] = useState<number | null>(null);
  const [semTokens, setSemTokens] = useState(false); // janela "seus tokens acabaram"
  const [mostrarCompra, setMostrarCompra] = useState(false);
  useEffect(() => {
    tokenService.me().then((t) => setSaldoTokens(Number(t?.points ?? 0))).catch(() => {});
  }, []);
  const abrirSemTokens = () => { setMostrarCompra(false); setSemTokens(true); };
  const pausaEfetiva = paused || digitando || oculto || semTokens;
  const pausedRef = useRef(false);
  const heldRef = useRef(false);       // true quando foi "segurar" (não é toque)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const grupo = useMemo(() => grupos[Math.min(pos.gi, grupos.length - 1)] ?? [], [grupos, pos.gi]);
  const story = grupo[Math.min(pos.si, grupo.length - 1)] ?? stories[0];

  // Mantém o ref em sincronia (o loop de animação lê o ref, não o estado).
  useEffect(() => { pausedRef.current = pausaEfetiva; }, [pausaEfetiva]);
  // Pausa/retoma o vídeo (segurar, digitando ou app em segundo plano).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (pausaEfetiva) v.pause(); else void v.play().catch(() => {});
  }, [pausaEfetiva]);
  // Trocou de aba/app: pausa; voltou: continua de onde parou.
  useEffect(() => {
    const aoMudar = () => setOculto(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, []);

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

  // Fim da fila: fecha. Na amostra grátis, convida a assinar.
  const fimDaFila = useCallback(() => {
    onClose();
    if (modoAmostra) {
      toast({ title: 'Curtiu? 🔥', description: 'Esses foram os stories mais curtidos de agora. Assine para ver todos, sem limite.' });
      navigate('/subscriptions');
    }
  }, [onClose, modoAmostra, navigate, toast]);
  const irParaGrupo = useCallback((d: 1 | -1) => {
    let ng = pos.gi + d;
    // Avançando, pula perfis que a pessoa já viu inteiros: não repete stories.
    if (d > 0) {
      const jaVisto = (g: FeedStory[]) => g.every((st) => st.viewed || vistosAqui.current.has(st.id));
      while (ng < grupos.length && jaVisto(grupos[ng])) ng += 1;
    }
    if (ng >= grupos.length) { fimDaFila(); return; }
    if (ng < 0) { setPos((p) => ({ ...p, si: 0 })); setProgress(0); return; }
    setDirEntrada(d);
    setPos({ gi: ng, si: d > 0 ? inicioDoGrupo(grupos[ng]) : 0 });
  }, [pos.gi, grupos, fimDaFila, inicioDoGrupo]);
  // Tocar: anda dentro do perfil; passou do último (ou antes do primeiro), troca de perfil.
  const go = useCallback((delta: number) => {
    const nsi = pos.si + delta;
    if (nsi >= 0 && nsi < grupo.length) { setPos({ gi: pos.gi, si: nsi }); return; }
    irParaGrupo(delta > 0 ? 1 : -1);
  }, [pos.gi, pos.si, grupo.length, irParaGrupo]);

  // Teclado (computador): setas navegam, espaço pausa, Esc fecha.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [go, onClose]);

  // Pré-carrega o próximo story e o primeiro do próximo perfil: sem tela preta
  // esperando a foto/vídeo baixar a cada toque.
  useEffect(() => {
    const proximos: FeedStory[] = [];
    if (pos.si + 1 < grupo.length) proximos.push(grupo[pos.si + 1]);
    const seguinte = grupos[pos.gi + 1];
    if (seguinte?.length) proximos.push(seguinte[inicioDoGrupo(seguinte)]);
    const elementos = proximos.filter((st) => st?.mediaUrl).map((st) => {
      const url = resolveServerUrl(st.mediaUrl || '');
      if (st.mimeType.startsWith('video/')) {
        const v = document.createElement('video');
        v.preload = 'auto';
        v.muted = true;
        v.src = url;
        v.load();
        return v;
      }
      const im = new Image();
      im.src = url;
      return im;
    });
    return () => {
      for (const el of elementos) {
        if (el instanceof HTMLVideoElement) { el.removeAttribute('src'); el.load(); }
      }
    };
  }, [pos.gi, pos.si, grupo, grupos, inicioDoGrupo]);

  // Auto-avanço estilo Instagram: imagem/texto enchem a barra em ~5s e passam
  // para o próximo. Vídeo é controlado pelo tempo do próprio vídeo (onTimeUpdate
  // + onEnded). Não-assinante não auto-avança (fica na amostra até tocar).
  useEffect(() => {
    if (story.mimeType.startsWith('video/')) return; // vídeo: progresso pelo player
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
  }, [story.id, story.mimeType, go]);

  // Registrar view
  useEffect(() => {
    vistosAqui.current.add(story.id);
    void storiesService.view(story.id).catch(() => {});
  }, [story.id]);

  // Resposta rápida (emoji) → vai como resposta do story, direto para o chat.
  const enviarRespostaRapida = async (emoji: string) => {
    try {
      await storiesService.addComment(story.id, emoji);
      toast({ title: `${emoji} enviado!`, description: 'Foi direto para as mensagens.' });
    } catch {
      toast({ title: 'Não foi possível enviar', variant: 'destructive' });
    }
  };

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
    // Sem token para o Coração Quente: avisa antes, sem animar à toa.
    if (reaction === 'hot' && myReaction !== 'hot' && saldoTokens !== null && saldoTokens < 1) {
      abrirSemTokens();
      return;
    }
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
      if (typeof res.tokensRestantes === 'number') {
        setSaldoTokens(res.tokensRestantes);
        if (res.tokensRestantes === 0) {
          toast({
            title: 'Esse foi seu último token 😉',
            description: 'Ganhe mais de graça curtindo, comentando e postando, ou compre para agilizar.',
            action: <Button size="sm" variant="outline" onClick={() => navigate('/tokens')}>Ganhar mais</Button>,
          });
        }
      }
    } catch (err) {
      setLiked(prev.liked);
      setLikeCount(prev.likeCount);
      setMyReaction(prev.myReaction);
      if (reaction === 'hot' && (err as any)?.response?.status === 402) {
        setSaldoTokens(Number((err as any)?.response?.data?.tokens ?? 0));
        abrirSemTokens();
      }
    }
  };

  // Gestos: deslizar para os lados troca de PERFIL; para baixo, fecha.
  const toqueInicio = useRef({ x: 0, y: 0 });
  const handleTouchStart = (e: React.TouchEvent) => {
    toqueInicio.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - toqueInicio.current.x;
    const dy = e.changedTouches[0].clientY - toqueInicio.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) irParaGrupo(dx < 0 ? 1 : -1);
    else if (dy > 100 && Math.abs(dy) > Math.abs(dx) * 1.5 && !digitando) onClose();
  };

  // Toque duplo no meio da tela curte (coração grande); toque simples avança.
  const ultimoToqueNoMeio = useRef(0);
  const toqueNoMeioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tocarNoMeio = () => {
    if (heldRef.current) { heldRef.current = false; return; }
    const agora = Date.now();
    if (agora - ultimoToqueNoMeio.current < 260) {
      ultimoToqueNoMeio.current = 0;
      if (toqueNoMeioTimer.current) clearTimeout(toqueNoMeioTimer.current);
      setCoracaoGrande(true);
      setTimeout(() => setCoracaoGrande(false), 800);
      if (story.author.id !== myUserId && !myReaction) void handleReact('heart');
      return;
    }
    ultimoToqueNoMeio.current = agora;
    toqueNoMeioTimer.current = setTimeout(() => go(1), 260);
  };
  useEffect(() => () => { if (toqueNoMeioTimer.current) clearTimeout(toqueNoMeioTimer.current); }, []);

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
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: recuoInferior(bottomInset),
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @keyframes nsCuboDir { from { transform: perspective(1200px) rotateY(-24deg) translateX(30%); opacity: .35; } to { transform: none; opacity: 1; } }
        @keyframes nsCuboEsq { from { transform: perspective(1200px) rotateY(24deg) translateX(-30%); opacity: .35; } to { transform: none; opacity: 1; } }
      `}</style>
      {/* Cada perfil é uma "face": trocar de perfil remonta e anima a entrada. */}
      <div
        key={story.author.id}
        className="flex min-h-0 flex-1 flex-col"
        style={dirEntrada !== 0 ? { animation: `${dirEntrada > 0 ? 'nsCuboDir' : 'nsCuboEsq'} 320ms ease-out` } : undefined}
      >
      {/* Barras: só os stories deste perfil. Somem enquanto segura o dedo. */}
      <div className={cn('flex gap-1 px-3 pt-3 pb-2 transition-opacity duration-200', paused && 'opacity-0')}>
        {grupo.map((st, i) => (
          <div key={st.id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white transition-none"
              style={{ width: i < pos.si ? '100%' : i === pos.si ? `${progress}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className={cn('flex items-center gap-3 px-3 pb-2 transition-opacity duration-200', paused && 'opacity-0')}>
        {story.author.avatar ? (
          <img src={resolveServerUrl(story.author.avatar)} alt={story.author.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white/60" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm ring-2 ring-white/60">
            {story.author.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { onClose(); navigate(story.author.id === myUserId ? '/profile' : `/users/${story.author.id}`); }}
              className="flex min-w-0 items-baseline gap-1 text-left hover:underline"
            >
              <span className="truncate text-sm font-semibold text-white">{story.author.name}</span>
              {story.author.age != null && (
                <span className="shrink-0 text-[11px] font-medium text-white/70">
                  {story.author.age}{story.author.partnerAge != null && ` & ${story.author.partnerAge}`}
                </span>
              )}
            </button>
            {/* Chegou até aqui = o viewer está nos favoritos do autor. */}
            {story.audience === 'favorites' && <SeloFavoritos />}
          </div>
          <p className="text-xs text-white/60">
            {modoAmostra ? '🔥 Em alta agora · ' : ''}{story.author.pinnedByMe ? 'Fixado · ' : ''}{timeLeft(story.expiresAt)}
          </p>
        </div>
        {/* Fixar: a partir daqui os stories deste perfil vêm no topo da fileira. */}
        <button
          type="button"
          onClick={() => void onTogglePin(story.author.id)}
          className={cn('p-1 transition-colors', story.author.pinnedByMe ? 'text-brand-pink' : 'text-white/70 hover:text-white')}
          aria-label={story.author.pinnedByMe ? 'Desfixar perfil' : 'Fixar perfil no topo'}
          title={story.author.pinnedByMe ? 'Desfixar perfil' : 'Fixar no topo dos stories'}
        >
          {story.author.pinnedByMe ? <Pin className="h-5 w-5 fill-current" /> : <Pin className="h-5 w-5" />}
        </button>
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

        {/* Zonas de toque na tela inteira, como no Instagram (o bloco de perfil
            que cobria a parte de baixo saiu). touch-manipulation tira o atraso
            e o zoom do toque duplo no iPhone. */}
        <button
          type="button"
          className="absolute left-0 top-0 h-full w-1/3 z-10 touch-manipulation"
          onClick={() => { if (heldRef.current) { heldRef.current = false; return; } go(-1); }}
          aria-label="Anterior"
        />
        <button
          type="button"
          className="absolute left-1/3 top-0 h-full w-1/3 z-10 touch-manipulation"
          onClick={tocarNoMeio}
          aria-label="Próximo (toque duplo curte)"
        />
        <button
          type="button"
          className="absolute right-0 top-0 h-full w-1/3 z-10 touch-manipulation"
          onClick={() => { if (heldRef.current) { heldRef.current = false; return; } go(1); }}
          aria-label="Próximo"
        />

        {/* Coração grande do toque duplo */}
        {coracaoGrande && (
          <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center">
            <Heart className="h-28 w-28 fill-white text-white drop-shadow-[0_4px_24px_rgba(236,77,107,.8)] animate-in zoom-in-50 fade-in duration-300" />
          </div>
        )}

        {/* Só uma linha discreta (tipo de perfil e cidade); o perfil abre tocando
            no nome lá em cima e a mensagem vai pela caixa de resposta. */}
        {story.author.id !== myUserId && linhaDeIdentidadeDoStory(story.author, espectador ?? {}) && (
          <div className={cn('pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2 pt-10 transition-opacity duration-200', paused && 'opacity-0')}>
            <p className="text-xs text-white/85">{linhaDeIdentidadeDoStory(story.author, espectador ?? {})}</p>
          </div>
        )}
      </div>

      {/* Comment bar + Like (not own story) */}
      {story.author.id !== myUserId && (
        <div className={cn('relative z-30 flex items-center gap-2 border-t border-white/10 bg-black/80 px-3 py-3 transition-opacity duration-200', paused && 'opacity-0')}>
          {/* Respostas rápidas: aparecem ao tocar em "Responder" */}
          {digitando && (
            <div className="absolute bottom-full left-0 right-0 flex justify-around bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8">
              {RESPOSTAS_RAPIDAS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void enviarRespostaRapida(emoji)}
                  className="text-3xl leading-none transition-transform active:scale-90 hover:scale-110"
                  aria-label={`Responder com ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
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
              // Como no Instagram: um toque curte (ou descurte); segurar abre as reações.
              onPointerDown={() => { seguraCoracao.current = setTimeout(() => { seguraCoracao.current = null; setShowReactions(true); }, 450); }}
              onPointerUp={() => {
                if (seguraCoracao.current) {
                  clearTimeout(seguraCoracao.current);
                  seguraCoracao.current = null;
                  if (showReactions) { setShowReactions(false); return; }
                  void handleReact(myReaction && myReaction !== 'hot' ? myReaction : 'heart');
                }
              }}
              onPointerLeave={() => { if (seguraCoracao.current) { clearTimeout(seguraCoracao.current); seguraCoracao.current = null; } }}
              onContextMenu={(e) => e.preventDefault()}
              className="flex h-11 w-11 flex-col items-center justify-center gap-0.5 select-none touch-manipulation"
              aria-label={myReaction ? 'Descurtir' : 'Curtir (segure para mais reações)'}
            >
              {myReaction && myReaction !== 'heart' ? (
                <span className={cn('text-[26px] leading-none transition-transform duration-200', likeAnim && 'scale-125')}>
                  {myReaction === 'hot' ? HOT_HEART : (REACTION_EMOJI[myReaction] ?? '💜')}
                </span>
              ) : (
                <Heart className={cn('h-7 w-7 transition-all duration-200', myReaction ? 'fill-rose-500 text-rose-500' : 'text-white', likeAnim && 'scale-125')} />
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
              'flex h-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 transition-all active:scale-90 touch-manipulation',
              myReaction === 'hot' ? 'bg-rose-500/25 ring-1 ring-rose-400/60' : 'hover:bg-white/10'
            )}
            aria-label="Dar um Coração Quente (1 token)"
            title="Coração Quente · custa 1 token"
          >
            <span className={cn('text-2xl leading-none transition-transform duration-200', likeAnim && myReaction === 'hot' && 'scale-125')}>
              {HOT_HEART}
            </span>
            <span className="text-[8px] font-semibold leading-none text-white/60">
              {saldoTokens === 0 && myReaction !== 'hot' ? '0 tokens' : '1 token'}
            </span>
          </button>

          {/* Input comentário com efeito de apagar */}
          <input
            className={cn(
              'flex-1 rounded-full bg-white/10 px-4 py-2 text-[16px] text-white placeholder:text-white/40 outline-none transition-opacity duration-200',
              clearing ? 'opacity-0' : 'opacity-100'
            )}
            placeholder="Enviar mensagem..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSendComment(); }}
            onFocus={() => setDigitando(true)}
            // Espera um pouco: tocar num emoji tira o foco antes do clique chegar.
            onBlur={() => setTimeout(() => setDigitando(false), 220)}
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
      {semTokens && (
        // Fica por cima do story (que pausa) e não deixa o toque vazar para
        // os gestos de avançar/voltar.
        <div
          className="absolute inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setSemTokens(false); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Seus tokens acabaram"
        >
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5 text-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">Seus tokens acabaram {HOT_HEART}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  O Coração Quente custa 1 token e faz você se destacar para quem postou o story.
                </p>
              </div>
              <button type="button" onClick={() => setSemTokens(false)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* A interação não se perde: a curtida normal é grátis. */}
            {myReaction !== 'heart' ? (
              <Button type="button" className="mt-4 w-full bg-gradient-primary text-white hover:opacity-90"
                onClick={() => { setSemTokens(false); void handleReact('heart'); }}>
                ❤️ Mandar uma curtida normal (grátis)
              </Button>
            ) : null}

            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">🎁 Ganhe tokens de graça</p>
              <p className="mt-0.5 text-xs text-muted-foreground">É só usar o NoSigilo: cada ação vale tokens.</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {GANHAR_TOKENS.filter((g) => !g.conteudo || ganhaPorConteudo(espectador?.gender)).map((g) => (
                  <li key={g.texto} className="flex items-center gap-1.5 text-sm">
                    <span aria-hidden="true">{g.icon}</span>
                    <span className="min-w-0 flex-1 leading-tight">{g.texto}</span>
                    <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">{g.pontos}</span>
                  </li>
                ))}
              </ul>
              <Button type="button" className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { setSemTokens(false); onClose(); navigate('/tokens'); }}>
                Ver como ganhar grátis
              </Button>
            </div>

            {mostrarCompra ? (
              <div className="mt-4">
                <ComprarTokens aoCreditar={() => {
                  tokenService.me().then((t) => setSaldoTokens(Number(t?.points ?? 0))).catch(() => {});
                  setSemTokens(false);
                }} />
              </div>
            ) : (
              <button type="button" onClick={() => setMostrarCompra(true)} className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                Está com pressa? Comprar tokens para agilizar
              </button>
            )}
          </div>
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
  const [tab, setTab]         = useState<'viewers' | 'comments' | 'fans'>('viewers');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [fans, setFans]       = useState<Fan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    setLoading(true);
    // allSettled, não all: a lista de fãs não pertence a este story (é do
    // perfil), então uma falha nela não deve derrubar as outras duas — o
    // que a pessoa abriu para ver foi quem assistiu.
    Promise.allSettled([
      storiesService.getViewers(storyId),
      storiesService.getComments(storyId),
      storiesService.getFans(),
    ]).then(([v, c, fa]) => {
      if (v.status === 'fulfilled') setViewers(v.value.viewers);
      if (c.status === 'fulfilled') setComments(c.value.comments);
      if (fa.status === 'fulfilled') setFans(fa.value.fans);
    }).finally(() => setLoading(false));
  }, [storyId, isPremium]);

  return (
    <div
      className="fixed inset-0 z-[9996] flex items-end justify-center bg-black/70"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: recuoInferior(bottomInset),
      }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-background pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3 border-b">
          <h3 className="font-semibold">Estatísticas do story</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {!isPremium ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Eye className="h-8 w-8 text-primary" />
            </div>
            <h4 className="text-lg font-bold">Alguém já viu seu story</h4>
            <p className="text-sm text-muted-foreground">
              Seu story está no ar e some em 24h. Assine para descobrir quem visualizou,
              quem curtiu e quem comentou — e chamar quem demonstrou interesse antes de expirar.
            </p>
            <Button
              className="mt-1 h-12 w-full gap-2 bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-90"
              onClick={onUpgrade}
            >
              <Crown className="h-4 w-4" /> Assinar e ver quem viu
            </Button>
            <p className="text-xs text-muted-foreground">Cancele quando quiser, sem fidelidade.</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex shrink-0 border-b">
              {(['viewers', 'comments', 'fans'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-3 text-xs font-medium transition-colors sm:text-sm',
                    tab === t ? 'border-b-2 border-primary text-brand-pink' : 'text-muted-foreground'
                  )}
                >
                  {t === 'viewers' ? `👁️ ${viewers.length}`
                    : t === 'comments' ? `💬 ${comments.length}`
                    : `📌 ${fans.length} fãs`}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
              ) : tab === 'fans' ? (
                fans.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Ninguém fixou seu perfil ainda.<br />
                    Quem fixa recebe seus stories no topo da fileira — é o público que volta.
                  </p>
                ) : (
                  fans.map((fa) => (
                    <div key={fa.id} className="flex w-full items-center gap-3 border-b px-5 py-3 transition-colors last:border-0 hover:bg-secondary/40">
                      <button
                        type="button"
                        onClick={() => { onClose(); navigate(`/users/${fa.id}`); }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="relative shrink-0">
                          {fa.avatar ? (
                            <img src={resolveServerUrl(fa.avatar)} alt={fa.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-brand-pink/60" />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold ring-2 ring-brand-pink/60">
                              {fa.name.charAt(0)}
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-brand-pink">
                            <Pin className="h-2.5 w-2.5 fill-current text-white" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="min-w-0 truncate text-sm font-medium hover:underline">{fa.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[fa.city, fa.state].filter(Boolean).join(' · ') || 'Acompanha seus stories'}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => { onClose(); navigate(`/chat?userId=${fa.id}`); }}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-primary/90 active:scale-95"
                      >
                        <Send className="h-3.5 w-3.5" /> Mensagem
                      </button>
                    </div>
                  ))
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
                        <p className="text-sm font-medium"><NomePerfil id={c.commenter.id} nome={c.commenter.name} aoNavegar={onClose} /></p>
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
  // Não assinante: amostra com os stories mais curtidos do momento.
  const [amostra,      setAmostra]      = useState<FeedStory[] | null>(null);
  const [previewIdx,   setPreviewIdx]   = useState<number | null>(null); // preview own stories
  const [ownMuted, setOwnMuted] = useState(true); // som ao revisar os próprios stories
  const [statsStoryId, setStatsStoryId] = useState<string | null>(null);
  const [statsOpen,    setStatsOpen]    = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null); // storyId being deleted
  const [paywallOpen,  setPaywallOpen]  = useState(false);
  const [returnTo,     setReturnTo]     = useState<string | null>(null); // rota de retorno ao fechar (ex.: /feed)

  // Quem aparece na fileira de interesse. Ver FiltroStories para a diferença
  // entre fixados e curtidos.
  const [filtro,       setFiltro]       = useState<FiltroStories>(leFiltroSalvo);
  // Audiência do story que está sendo composto AGORA. Volta para 'all' depois
  // de cada publicação de propósito: restrito precisa ser uma escolha
  // consciente a cada post, não um modo em que se esquece de estar.
  const [audiencia,    setAudiencia]    = useState<StoryAudience>('all');
  const [favOpen,      setFavOpen]      = useState(false);
  const [favSalvando,  setFavSalvando]  = useState(false);
  const [favCount,     setFavCount]     = useState(0);

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
    const [mineRes, feedRes, favRes] = await Promise.allSettled([
      storiesService.getMyStory(),
      storiesService.getFeed(),
      // Só o tamanho interessa aqui: o composer precisa saber se dá para
      // publicar restrito antes de a pessoa tentar e levar um erro.
      storiesService.getFavorites(),
    ]);
    if (favRes.status === 'fulfilled') setFavCount(favRes.value.favoriteIds.length);
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

  useEffect(() => {
    try { localStorage.setItem(CHAVE_FILTRO, filtro); } catch { /* modo restrito: só não lembra */ }
  }, [filtro]);

  // A fileira que está na tela. O viewer recebe ESTA lista, não a completa —
  // senão avançar dentro do story pularia para perfis que o filtro escondeu.
  const feedVisivel = feed.filter((s) => (
    filtro === 'fixados'  ? !!s.author.pinnedByMe :
    filtro === 'curtidos' ? !!s.author.likedByMe  : true
  ));
  // Um quadro por perfil (como no Instagram): a capa é o primeiro story que
  // falta ver (ou o mais novo, se já viu todos) e o selo mostra novos/vistos.
  const quadrosPorPerfil = useMemo(() => {
    const porAutor = new Map<string, { i: number; st: FeedStory }[]>();
    feedVisivel.forEach((st, i) => {
      const lista = porAutor.get(st.author.id);
      if (lista) lista.push({ i, st }); else porAutor.set(st.author.id, [{ i, st }]);
    });
    return [...porAutor.values()].map((lista) => {
      const ordenada = [...lista].sort((a, b) => a.st.createdAt.localeCompare(b.st.createdAt));
      const capa = ordenada.find((x) => !x.st.viewed) ?? ordenada[ordenada.length - 1];
      const novos = lista.filter((x) => !x.st.viewed).length;
      return { story: capa.st, i: capa.i, novos, vistos: lista.length - novos };
    }).sort((a, b) => Number(b.novos > 0) - Number(a.novos > 0)); // quem tem story novo primeiro
  }, [feedVisivel]);
  const totalFixados  = feed.filter((s) => s.author.pinnedByMe).length;
  const totalCurtidos = feed.filter((s) => s.author.likedByMe).length;

  const salvaFavoritos = async (ids: string[]) => {
    setFavSalvando(true);
    try {
      const res = await storiesService.setFavorites(ids);
      setFavCount(res.favoriteIds.length);
      setFavOpen(false);
      toast({
        title: res.favoriteIds.length === 0 ? 'Lista de favoritos vazia' : `${res.favoriteIds.length} favorito(s) salvos`,
        description: res.favoriteIds.length === 0
          ? 'Sem favoritos você não consegue publicar stories restritos.'
          : 'Só eles veem os stories marcados com a estrela verde.',
      });
      // A lista mudou: um story restrito que já está no ar pode ter ganhado
      // ou perdido público, e o feed do próprio autor não reflete isso, mas
      // recarregar mantém a tela coerente com o servidor.
      await load();
    } catch {
      toast({ title: 'Erro ao salvar favoritos', variant: 'destructive' });
    } finally {
      setFavSalvando(false);
    }
  };

  const alternaPin = async (autorId: string) => {
    try {
      const { pinned } = await storiesService.togglePin(autorId);
      // Atualiza em memória em vez de recarregar: o viewer pode estar aberto,
      // e um load() aqui remontaria a fileira embaixo da pessoa.
      setFeed((antes) => antes.map((s) => (
        s.author.id === autorId ? { ...s, author: { ...s.author, pinnedByMe: pinned } } : s
      )));
      toast({
        title: pinned ? '📌 Perfil fixado' : 'Perfil desfixado',
        description: pinned ? 'Os stories dele passam a aparecer primeiro para você.' : undefined,
      });
    } catch (err) {
      const msg = (err as any)?.response?.data?.message;
      toast({ title: msg || 'Erro ao fixar perfil', variant: 'destructive' });
    }
  };

  // Amostra grátis para quem não assina: o story tocado (se for foto) e os mais
  // curtidos do momento, até 3 perfis diferentes. Mostrar o que a comunidade
  // mais gostou vende melhor que um story qualquer, e dá visualização a quem
  // posta bem. Vídeo de story é só para assinante, então fica de fora.
  const montarAmostra = useCallback((tocado?: FeedStory) => {
    const fotos = feed.filter((st) => !st.isVideoLocked && !st.mimeType.startsWith('video/') && (st.mediaUrl || st.text));
    // Os que a pessoa ainda não viu vêm antes; só depois repete os já vistos.
    // Sem isso a amostra abria sempre os mesmos campeões de curtida.
    const maisCurtidos = [...fotos].sort((a, b) =>
      Number(a.viewed) - Number(b.viewed) || (b.likeCount ?? 0) - (a.likeCount ?? 0));
    const escolhidos: FeedStory[] = [];
    const autores = new Set<string>();
    const primeiro = tocado && fotos.some((st) => st.id === tocado.id) ? [tocado] : [];
    for (const st of [...primeiro, ...maisCurtidos]) {
      if (autores.has(st.author.id)) continue;
      autores.add(st.author.id);
      escolhidos.push(st);
      if (escolhidos.length >= 3) break;
    }
    return escolhidos;
  }, [feed]);

  const handleOpenStory = useCallback(async (idx: number) => {
    // Stories são só para assinante ou trial: sem amostra grátis.
    if (!isPremium) { setPaywallOpen(true); return; }
    const ok = await requireFields(['photo', 'birthDate']);
    if (!ok) return;
    setViewerIdx(idx);
  }, [isPremium, requireFields, montarAmostra, feedVisivel]);

  // Auto-abre o story certo ao chegar por link:
  //  ?open=<id>   → story de outro autor (vindo da barra no Feed) → viewer
  //  ?storyId=<id> → seu próprio story (vindo de notificação) → preview
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (loading || autoOpenedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    const ownId = params.get('storyId');
    const pedeAmostra = params.get('amostra') === '1';
    if (!openId && !ownId && !pedeAmostra) return;
    autoOpenedRef.current = true;
    // Aberto a partir do feed → ao fechar o story, volta pro feed (não fica em /stories)
    if (params.get('from') === 'feed') setReturnTo('/feed');
    window.history.replaceState({}, '', '/stories');
    if (ownId) {
      const ownIdx = myStories.findIndex((s) => s.id === ownId);
      if (ownIdx >= 0) { setPreviewIdx(ownIdx); return; }
    }
    if (pedeAmostra) {
      if (!isPremium) setPaywallOpen(true);
      return;
    }
    if (openId) {
      // O link manda abrir um story específico. Se o filtro ligado esconde
      // esse story, o filtro cede: quem clicou no link quer ver aquilo, e
      // uma tela que não abre nada seria um beco sem saída sem explicação.
      if (filtro !== 'todos' && !feedVisivel.some((s) => s.id === openId) && feed.some((s) => s.id === openId)) {
        autoOpenedRef.current = false;
        setFiltro('todos');
        return;
      }
      const idx = feedVisivel.findIndex((s) => s.id === openId);
      if (idx >= 0) {
        // Não assinante cai na amostra dos mais curtidos (handleOpenStory decide).
        void handleOpenStory(idx);
      }
    }
  }, [loading, feed, feedVisivel, filtro, myStories, handleOpenStory, isPremium, montarAmostra]);

  // Escolha da audiência, igual nos dois composers. Fica junto do botão de
  // publicar de propósito: é a última coisa que a pessoa lê antes de postar.
  //
  // "Favoritos" com a lista vazia não é bloqueado aqui — o toque abre a
  // seleção. Desabilitar o botão sem dizer por quê seria pior.
  const seletorDeAudiencia = (tema: 'escuro' | 'claro') => {
    const escuro = tema === 'escuro';
    const opcoes = [
      { id: 'all'       as const, rotulo: 'Todos',     icone: <Globe className="h-3.5 w-3.5" /> },
      { id: 'favorites' as const, rotulo: favCount > 0 ? `Favoritos (${favCount})` : 'Favoritos', icone: <SeloFavoritos className="h-4 w-4" /> },
    ];
    return (
      <div className="flex items-center justify-center gap-2">
        {opcoes.map((o) => {
          const ativo = audiencia === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setAudiencia(o.id);
                if (o.id === 'favorites' && favCount === 0) setFavOpen(true);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                ativo
                  ? (o.id === 'favorites'
                      ? 'border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]'
                      : 'border-primary bg-primary/15 text-primary')
                  : escuro
                    ? 'border-white/20 text-white/60 hover:text-white'
                    : 'border-border text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={ativo}
            >
              {o.icone}
              {o.rotulo}
            </button>
          );
        })}
        {audiencia === 'favorites' && (
          <button
            type="button"
            onClick={() => setFavOpen(true)}
            className={cn('text-xs underline underline-offset-2', escuro ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground')}
          >
            editar
          </button>
        )}
      </div>
    );
  };

  const handleUpload = async (escolhido: File) => {
    if (!escolhido) return;
    let file = escolhido;
    // HEIC (iPhone e alguns Android) não aparece na prévia do Chrome: converte antes de abrir o editor.
    if (ehFotoHeic(file)) {
      try {
        file = await heicParaJpeg(file);
      } catch {
        toast({ title: 'Não foi possível abrir a foto', description: FOTO_NAO_ABRE, variant: 'destructive' });
        return;
      }
    }
    // Validação de vídeo máx 60s (igual ao Instagram) via duration
    if (file.type.startsWith('video/')) {
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = URL.createObjectURL(file);
        v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
        v.onerror = () => resolve(0);
      });
      if (duration > 60) {
        toast({ title: 'Vídeo muito longo', description: 'O vídeo deve ter no máximo 60 segundos.', variant: 'destructive' });
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
      await storiesService.create(String(media.id), {
        ...(text ? { text, textOverlay: { x: ovX, y: ovY, color: ovColor, size: ovSize } } : {}),
        audience: audiencia,
      });
      toast({
        title: '✨ Story publicado!',
        description: audiencia === 'favorites'
          ? `Só os seus ${favCount} favoritos veem. Expira em 24 horas.`
          : 'Expira em 24 horas.',
      });
      setAudiencia('all');
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
      await storiesService.createText(text, storyBg, { audience: audiencia });
      toast({
        title: '✨ Story publicado!',
        description: audiencia === 'favorites'
          ? `Só os seus ${favCount} favoritos veem. Expira em 24 horas.`
          : 'Expira em 24 horas.',
      });
      setAudiencia('all');
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

  // 📌 Story em destaque: 15 tokens, 24h na frente da barra da região.
  const [destacando, setDestacando] = useState<string | null>(null);
  const [semTokensDestaque, setSemTokensDestaque] = useState(false);
  const destacarStory = async (storyId: string) => {
    setDestacando(storyId);
    try {
      const r = await usosTokensService.destacarStory(storyId);
      setMyStories((prev) => prev.map((x: any) => (x.id === storyId ? { ...x, destaqueAte: r.destaqueAte } : x)));
      toast({ title: '📌 Story em destaque!', description: 'Ele aparece primeiro para quem é da sua região pelas próximas 24h.' });
    } catch (e: any) {
      if (e?.response?.status === 402) setSemTokensDestaque(true);
      else toast({ title: 'Não foi possível destacar', description: e?.response?.data?.message || 'Tente de novo.', variant: 'destructive' });
    } finally {
      setDestacando(null);
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
    if ((err as any)?.response?.data?.error === 'no_favorites') {
      toast({ title: 'Nenhum favorito escolhido', description: 'Escolha os perfis favoritos antes de publicar só para eles.', variant: 'destructive' });
      setFavOpen(true);
    } else if (msg.includes('max_stories') || msg.includes('10 stories')) {
      toast({ title: 'Limite atingido', description: 'Você já tem 10 stories ativos. Apague um antes de postar.', variant: 'destructive' });
    } else {
      const aviso = err instanceof Error && err.message === FOTO_NAO_ABRE ? FOTO_NAO_ABRE : undefined;
      toast({ title: 'Erro ao publicar story', description: aviso, variant: 'destructive' });
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="whitespace-nowrap text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Meus Stories {myStories.length > 0 && <span className="text-brand-pink ml-1">{myStories.length}</span>}
          </h2>
          {/* Botões de adicionar sempre visíveis */}
          {myStories.length === 0 && (
            <button
              type="button"
              onClick={() => setFavOpen(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <SeloFavoritos className="h-4 w-4" />
              Favoritos{favCount > 0 ? ` ${favCount}` : ''}
            </button>
          )}
          {myStories.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
              <button type="button" onClick={() => setFavOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                title="Escolher quem vê seus stories de favoritos">
                <SeloFavoritos className="h-4 w-4" />
                {favCount > 0 ? favCount : ''}
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
                  {/* Para eu saber, de relance, qual dos meus stories é restrito. */}
                  {s.audience === 'favorites' && <SeloFavoritos className="absolute left-1.5 top-1.5 h-5 w-5" />}
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
                {(s as any).destaqueAte ? (
                  <p className="mt-1 text-center text-[11px] font-semibold text-amber-500">📌 Em destaque</p>
                ) : (
                  <button type="button" disabled={destacando === s.id} onClick={() => void destacarStory(s.id)}
                    className="mt-1 w-full rounded-lg border border-amber-400/40 bg-amber-400/10 py-1 text-[11px] font-semibold text-amber-600 hover:bg-amber-400/20 disabled:opacity-50 dark:text-amber-400">
                    {destacando === s.id ? '...' : '📌 Destacar · 15'}
                  </button>
                )}
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
                Foto, vídeo de até 60s ou só texto · fica 24h no ar · aparece para quem combina com você
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
          {feedVisivel.length > 0 && <span className="ml-2 text-brand-pink">{feedVisivel.length}</span>}
        </h2>

        {/* Filtro da fileira. Só aparece quando existe o que filtrar — com a
            fileira vazia os botões não teriam o que fazer. */}
        {feed.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              { id: 'todos'    as const, rotulo: 'Todos',        icone: Globe, total: feed.length },
              { id: 'fixados'  as const, rotulo: 'Fixados',      icone: Pin,   total: totalFixados },
              { id: 'curtidos' as const, rotulo: 'Que eu curti', icone: Heart, total: totalCurtidos },
            ]).map(({ id, rotulo, icone: Icone, total }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  filtro === id
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={filtro === id}
              >
                <Icone className="h-3.5 w-3.5" />
                {rotulo}
                <span className={cn('tabular-nums', filtro === id ? 'text-primary/70' : 'text-muted-foreground/70')}>{total}</span>
              </button>
            ))}
          </div>
        )}

        {feedVisivel.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {filtro === 'fixados' ? (
                <>Você ainda não fixou nenhum perfil.<br />Abra um story e toque no 📌 para acompanhar como fã.</>
              ) : filtro === 'curtidos' ? (
                <>Ninguém que você curtiu tem story agora.<br />Curta perfis para acompanhar só eles por aqui.</>
              ) : (
                <>Nenhum story disponível no momento.<br />Quando perfis compatíveis publicarem, aparecerão aqui.</>
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {quadrosPorPerfil.map(({ story, i, novos, vistos }) => (
              <button
                key={story.author.id}
                type="button"
                onClick={() => void handleOpenStory(i)}
                className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black group"
              >
                {/* Quantos stories do perfil faltam ver e quantos já foram vistos. */}
                {novos + vistos > 1 && (
                  <div className="pointer-events-none absolute bottom-6 left-2 right-2 z-[1] flex flex-wrap gap-1">
                    {novos > 0 && <span className="rounded-full bg-brand-pink px-1.5 py-0.5 text-[9px] font-bold text-white">{novos} {novos === 1 ? 'novo' : 'novos'}</span>}
                    {vistos > 0 && <span className="rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white/85">{vistos} {vistos === 1 ? 'visto' : 'vistos'}</span>}
                  </div>
                )}
                {/* Mídia — borrada só nos NÃO-vistos, p/ gerar curiosidade */}
                <div className={cn('absolute inset-0', !story.viewed && isPremium && 'scale-110 blur-xl brightness-[0.8]')}>
                  {isPremium ? (
                    <StoryContent story={story} thumb />
                  ) : story.author.avatar ? (
                    // Sem assinatura o conteúdo nem chega: a capa é a foto do perfil.
                    <img src={resolveServerUrl(story.author.avatar)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary/40 to-violet-700/50" />
                  )}
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

                {/* Fixado: o alfinete explica por que este story está no topo. */}
                {story.author.pinnedByMe && (
                  <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-pink/90" title="Perfil fixado">
                    <Pin className="h-3 w-3 fill-current text-white" />
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

                {/* Estrela verde: só chega aqui story restrito de quem colocou
                    o viewer nos favoritos. */}
                {story.audience === 'favorites' && (
                  <SeloFavoritos className="absolute left-8 top-7 h-4 w-4" />
                )}

                {/* Name */}
                <p className="absolute bottom-2 left-2 right-2 text-[10px] font-semibold text-white truncate">
                  {story.author.name}
                </p>

                {/* Viewed indicator — desloca quando o alfinete ocupa o canto */}
                {story.viewed && (
                  <div className={cn(
                    'absolute top-2 flex items-center justify-center h-5 w-5 rounded-full bg-white/20',
                    story.author.pinnedByMe ? 'right-9' : 'right-2',
                  )}>
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
            style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: recuoInferior(bottomInset),
      }}
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
          stories={feedVisivel}
          startIndex={viewerIdx}
          myUserId={user?.id || ''}
          onClose={() => { setViewerIdx(null); if (returnTo) navigate(returnTo); else void load(); }}
          onTogglePin={alternaPin}
        />
      )}
      {amostra && (
        <StoryViewer
          stories={amostra}
          startIndex={0}
          myUserId={user?.id || ''}
          modoAmostra
          onClose={() => {
            // O "viewed" do servidor só volta no próximo load; marca já aqui
            // para a próxima amostra nesta tela não repetir os mesmos.
            const vistos = new Set(amostra.map((st) => st.id));
            setFeed((antes) => antes.map((st) => (vistos.has(st.id) ? { ...st, viewed: true } : st)));
            setAmostra(null);
            if (returnTo) navigate(returnTo);
          }}
          onTogglePin={alternaPin}
        />
      )}

      {/* Stats modal */}
      <SemTokensDialog open={semTokensDestaque} onOpenChange={setSemTokensDestaque} custo={15} recurso="Destacar o story por 24h" />
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
          style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: recuoInferior(bottomInset),
      }}
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
            {/* 16px: com letra menor o Safari do iPhone dá zoom ao tocar e corta a tela (relato de 18/10/2026). */}
            <textarea
              value={ovText}
              onChange={(e) => setOvText(e.target.value.slice(0, 280))}
              placeholder="Escreva um texto sobre a mídia (opcional)"
              rows={2}
              className="w-full resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[16px] text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-primary/50"
            />
            {ovText.trim() ? (
              <p className="text-center text-[11px] text-white/50">✋ Arraste o texto sobre a mídia para posicionar</p>
            ) : null}
            {seletorDeAudiencia('escuro')}
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
              className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-primary/40"
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

            <div className="mb-3">{seletorDeAudiencia('claro')}</div>

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

      <FavoritesPicker
        open={favOpen}
        onClose={() => setFavOpen(false)}
        onSave={salvaFavoritos}
        salvando={favSalvando}
      />

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      <BackToTop />
    </div>
  );
}
