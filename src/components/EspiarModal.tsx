import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, MapPin, ShieldCheck, X } from 'lucide-react';
import { regiaoPublicaService, type RegiaoPublica } from '@/services/api';

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

const INTERESSES = [
  { valor: 'Casal (Ele/Ela)', rotulo: 'Casais' },
  { valor: 'Mulher', rotulo: 'Mulheres' },
  { valor: 'Homem', rotulo: 'Homens' },
  { valor: 'outros', rotulo: 'Trans, CD e travestis' },
];

/** Guarda a resposta para o cadastro já vir preenchido. */
export const CHAVE_ESPIAR = 'nosigilo:espiar';

/**
 * Duas perguntas antes de espiar: estado e que tipo de perfil interessa. Mostra
 * só CONTAGEM de cadastros reais da região — nenhuma foto ou perfil aparece
 * para quem não tem conta. As respostas seguem para o cadastro.
 */
export default function EspiarModal({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const navigate = useNavigate();
  const [uf, setUf] = useState('');
  const [interesse, setInteresse] = useState('');
  const [dados, setDados] = useState<RegiaoPublica | null>(null);
  const [carregando, setCarregando] = useState(false);

  if (!aberto) return null;

  // Só consulta quando já sabemos estado e interesse: o número mostrado é o de
  // perfis daquele tipo no estado da pessoa.
  const consultar = async (estado: string, tipo: string) => {
    setUf(estado);
    setInteresse(tipo);
    setDados(null);
    if (!estado || !tipo) return;
    setCarregando(true);
    try {
      setDados(await regiaoPublicaService.porUf(estado, tipo));
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  };

  const continuar = () => {
    try {
      sessionStorage.setItem(CHAVE_ESPIAR, JSON.stringify({ uf, interesse }));
    } catch { /* sessão bloqueada: segue sem guardar */ }
    const params = new URLSearchParams();
    if (uf) params.set('uf', uf);
    if (interesse) params.set('interesse', interesse);
    navigate(`/espiar?${params.toString()}`);
  };

  const irDireto = () => {
    try { sessionStorage.setItem(CHAVE_ESPIAR, JSON.stringify({ uf, interesse })); } catch { /* ok */ }
    const params = new URLSearchParams();
    if (uf) params.set('uf', uf);
    if (interesse) params.set('interesse', interesse);
    navigate(`/register?${params.toString()}`);
  };

  return (
    <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black/80 p-4" onClick={aoFechar}>
      <div
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Ver quem está na sua região</h2>
            <p className="text-sm text-muted-foreground">Duas perguntas rápidas e já usamos elas no seu cadastro.</p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          1. Você é de qual estado?
        </label>
        <select
          value={uf}
          onChange={(e) => void consultar(e.target.value, interesse)}
          className="mb-4 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="">Escolha seu estado</option>
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          2. Você procura por quem?
        </label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {INTERESSES.map((i) => (
            <button
              key={i.valor}
              type="button"
              onClick={() => void consultar(uf, i.valor)}
              className={
                interesse === i.valor
                  ? 'rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground'
                  : 'rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }
            >
              {i.rotulo}
            </button>
          ))}
        </div>

        {carregando && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Contando quem já está aí...
          </div>
        )}

        {dados && !carregando && (
          <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {dados.uf}
            </p>
            <p className="mt-1 text-3xl font-bold text-brand-pink">{dados.cadastrados.toLocaleString('pt-BR')}</p>
            <p className="text-sm">
              {INTERESSES.find((i) => i.valor === interesse)?.rotulo.toLowerCase() ?? 'perfis'} cadastrados no seu estado
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={continuar}
          disabled={!uf || !interesse}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Espiar agora
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={irDireto}
          className="mt-2 w-full rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          Já quero criar minha conta grátis
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Fotos e perfis só aparecem para quem tem conta.
        </p>
      </div>
    </div>
  );
}
