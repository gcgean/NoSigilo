import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import SemTokensDialog from '@/components/SemTokensDialog';
import { useToast } from '@/hooks/use-toast';
import { textoDistancia } from '@/utils/distancia';
import { usosTokensService, type PerfilDisponivel } from '@/services/api';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * "🔥 Disponível hoje": a pessoa paga 10 tokens e fica 12h com o selo no
 * perfil, no topo do Match e nesta faixa, que mostra quem mais está a fim de
 * sair hoje no mesmo estado (e que combina com o que ela procura).
 */
export default function DisponivelHoje() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [perfis, setPerfis] = useState<PerfilDisponivel[]>([]);
  const [meuAte, setMeuAte] = useState<string | null>(null);
  const [custo, setCusto] = useState(10);
  const [horas, setHoras] = useState(12);
  const [ocupado, setOcupado] = useState(false);
  const [semTokens, setSemTokens] = useState(false);

  const carregar = () => usosTokensService.disponiveisHoje().then((d) => {
    setPerfis(d.perfis);
    setMeuAte(d.meuDisponivelAte);
    setCusto(d.custo);
    setHoras(d.horas);
  }).catch(() => {});
  useEffect(() => { void carregar(); }, []);

  const ativar = async () => {
    setOcupado(true);
    try {
      const r = await usosTokensService.ficarDisponivel();
      setMeuAte(r.disponivelAte);
      toast({ title: '🔥 Você está disponível hoje!', description: `Seu perfil fica em destaque até ${hora(r.disponivelAte)}.` });
    } catch (e: any) {
      if (e?.response?.status === 402) setSemTokens(true);
      else toast({ title: 'Não foi possível ativar', description: 'Tente de novo.', variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const encerrar = async () => {
    setOcupado(true);
    try { await usosTokensService.encerrarDisponivel(); setMeuAte(null); } catch { /* tenta de novo depois */ } finally { setOcupado(false); }
  };

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-bold">🔥 Disponíveis hoje</p>
          <p className="text-sm text-muted-foreground">
            {meuAte
              ? `Você está disponível até ${hora(meuAte)}. Seu perfil aparece com o selo e no topo do Match.`
              : `A fim de sair hoje? Fique ${horas}h em destaque com o selo 🔥 no perfil e no topo do Match.`}
          </p>
        </div>
        {meuAte ? (
          <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => void encerrar()}>Encerrar</Button>
        ) : (
          <Button type="button" disabled={ocupado} onClick={() => void ativar()} className="shrink-0 bg-gradient-to-r from-orange-500 to-rose-500 text-white hover:opacity-90">
            {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Ficar disponível hoje · {custo} tokens
          </Button>
        )}
      </div>

      {perfis.length > 0 ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {perfis.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/users/${p.id}`)} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
              <div className="rounded-full p-0.5 ring-2 ring-orange-500">
                <UserAvatar user={{ name: p.name, avatar: p.avatar, isOnline: p.isOnline }} className="h-16 w-16" />
              </div>
              <span className="w-full truncate text-xs font-medium">{p.name}</span>
              <span className="text-[11px] text-muted-foreground">{textoDistancia(p.distanceKm, { cidade: p.city })}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Ninguém do seu estado está disponível agora. Seja o primeiro: quem ativa aparece aqui para todo mundo.</p>
      )}

      <SemTokensDialog open={semTokens} onOpenChange={setSemTokens} custo={custo} recurso="Ficar disponível hoje" aoComprar={() => void ativar()} />
    </div>
  );
}
