import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BookOpen, Calendar, Clapperboard, Coins, Heart, Lock, MapPin,
  MessageCircle, Radio, Search, ShieldCheck, Sparkles, Users, Video,
} from 'lucide-react';
import { espiarService, marcarPassoCadastro, type PerfilEspiado } from '@/services/api';

// Todas as funções que a plataforma oferece. A pessoa vê o que existe; abrir
// qualquer uma pede cadastro.
const FUNCOES = [
  { id: 'feed', nome: 'Feed', icone: Sparkles, descricao: 'Fotos, vídeos e relatos de casais e solteiros da sua região, atualizados o dia todo.' },
  { id: 'buscar', nome: 'Buscar', icone: Search, descricao: 'Filtra por cidade, distância, tipo de perfil e interesses.' },
  { id: 'match', nome: 'Match', icone: Heart, descricao: 'Curte quem te interessa e conversa quando o interesse é dos dois lados.' },
  { id: 'radar', nome: 'Radar', icone: Radio, descricao: 'Mostra quem está disponível agora perto de você.' },
  { id: 'stories', nome: 'Stories', icone: Video, descricao: 'Publicações que somem em 24h, com controle de quem pode ver.' },
  { id: 'videos', nome: 'Vídeos', icone: Clapperboard, descricao: 'Vídeos dos membros, com filtros de já vistos, curtidos e comentados.' },
  { id: 'contos', nome: 'Contos eróticos', icone: BookOpen, descricao: '19 categorias de contos escritos pelos próprios membros.' },
  { id: 'chat', nome: 'Chat', icone: MessageCircle, descricao: 'Conversa privada, com envio de foto e vídeo que você controla.' },
  { id: 'eventos', nome: 'Eventos', icone: Calendar, descricao: 'Encontros e festas com grupo próprio para quem confirma presença.' },
  { id: 'grupos', nome: 'Grupos', icone: Users, descricao: 'Grupos por cidade e por interesse para conhecer gente junto.' },
  { id: 'tokens', nome: 'Tokens', icone: Coins, descricao: 'Ganha pontos usando a plataforma e troca por dias de acesso.' },
];


/**
 * Espiar: quem ainda não tem conta vê todas as funções e a quantidade real de
 * gente na região, mas nenhum conteúdo. As fotos vêm borradas do servidor —
 * o arquivo original nunca chega aqui — e qualquer clique pede cadastro.
 */
export default function Espiar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uf = (params.get('uf') || '').toUpperCase();
  const interesse = params.get('interesse') || '';
  const [funcao, setFuncao] = useState('feed');
  const [perfis, setPerfis] = useState<PerfilEspiado[]>([]);
  const [parede, setParede] = useState<string | null>(null);
  // Rolagem infinita: carrega a próxima página quando o rodapé aparece na tela.
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const sentinelaRef = useRef<HTMLDivElement | null>(null);

  const carregarPagina = useCallback(async (p: number) => {
    if (!uf) return;
    setCarregando(true);
    try {
      const r = await espiarService.perfis(uf, interesse, p);
      setPerfis((atual) => (p === 1 ? r.perfis : [...atual, ...r.perfis]));
      setTemMais(!!r.temMais);
    } catch {
      setTemMais(false);
    } finally {
      setCarregando(false);
    }
  }, [uf, interesse]);

  useEffect(() => {
    setPerfis([]);
    setPagina(1);
    setTemMais(true);
    void carregarPagina(1);
  }, [carregarPagina]);

  useEffect(() => {
    const alvo = sentinelaRef.current;
    if (!alvo || !temMais || carregando) return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas[0]?.isIntersecting) {
        setPagina((p) => {
          const proxima = p + 1;
          void carregarPagina(proxima);
          return proxima;
        });
      }
    }, { rootMargin: '400px' });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [temMais, carregando, carregarPagina]);

  const irParaCadastro = () => {
    const p = new URLSearchParams();
    if (uf) p.set('uf', uf);
    if (interesse) p.set('interesse', interesse);
    navigate(`/register?${p.toString()}`);
  };

  const atual = FUNCOES.find((f) => f.id === funcao) ?? FUNCOES[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-brand-pink">NoSigilo.net</Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Modo espiar</span>
            <button
              type="button"
              onClick={irParaCadastro}
              className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Criar conta grátis
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FUNCOES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFuncao(f.id)}
              className={
                funcao === f.id
                  ? 'flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground'
                  : 'flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }
            >
              <f.icone className="h-3.5 w-3.5" />
              {f.nome}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border/60 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><atual.icone className="h-5 w-5 text-brand-pink" /> {atual.nome}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{atual.descricao}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {perfis.map((p, i) => (
            <button
              key={`${p.nome}-${i}`}
              type="button"
              onClick={() => { marcarPassoCadastro('espiar_parede'); setParede(p.nome); }}
              className="group relative overflow-hidden rounded-2xl border border-border/60 text-left"
            >
              <div className="relative aspect-[3/4] w-full bg-muted">
                {p.foto && <img src={p.foto} alt="" aria-hidden className="h-full w-full object-cover" />}
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <Lock className="h-6 w-6 text-white/90" />
                </div>
              </div>
              <div className="p-2">
                <p className="truncate text-sm font-semibold">{p.nome}</p>
                <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {p.cidade || p.estado} · {p.tipo || 'Membro'}
                </p>
              </div>
            </button>
          ))}
          {perfis.length === 0 && !carregando && (
            <p className="col-span-full rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Escolha seu estado na página inicial para ver quem está perto de você.
            </p>
          )}
        </div>

        <div ref={sentinelaRef} className="h-10" />
        {carregando && (
          <p className="text-center text-sm text-muted-foreground">Carregando mais perfis...</p>
        )}
        {!temMais && perfis.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">Você viu todos os perfis desta busca.</p>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          As fotos aparecem borradas para quem não tem conta. A foto original nunca sai do servidor.
        </p>

        <button
          type="button"
          onClick={irParaCadastro}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-semibold text-white"
        >
          Criar conta grátis e ver tudo
          <ArrowRight className="h-4 w-4" />
        </button>
      </main>

      {parede && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setParede(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-background p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-7 w-7 text-brand-pink" />
            </div>
            <h3 className="text-lg font-bold">Crie sua conta para ver {parede}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              O cadastro é grátis e leva menos de um minuto. Aí você vê as fotos, conversa e usa tudo.
            </p>
            <button
              type="button"
              onClick={irParaCadastro}
              className="mt-5 w-full rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white"
            >
              Criar conta grátis
            </button>
            <button
              type="button"
              onClick={() => setParede(null)}
              className="mt-2 w-full rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
            >
              Continuar espiando
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
