import { useCallback, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Admin: tema de cada noite d'A Casa. A sequência gira sozinha (sexta, sábado…);
 * aqui dá para trocar o tema de uma data ou voltar ao automático.
 */
type Tema = { id: string; nome: string; descricao: string; dress: string | null };
type Noite = { data: string; dia: 'sexta' | 'sabado'; tema: Tema; escolhido: boolean };

const dataCurta = (data: string) => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};

export default function TemasDaCasa() {
  const { toast } = useToast();
  const [temas, setTemas] = useState<Tema[]>([]);
  const [noites, setNoites] = useState<Noite[]>([]);
  const [noitesPortugal, setNoitesPortugal] = useState<Noite[]>([]);

  const carregar = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/casa/admin/temas');
      setTemas(data.temas ?? []);
      setNoites(data.noites ?? []);
      setNoitesPortugal(data.noitesPortugal ?? []);
    } catch { /* sem acesso */ }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const trocar = async (n: Noite, temaId: string, portugal = false) => {
    try {
      await apiClient.post('/casa/admin/temas', { data: n.data, temaId: temaId || null, ...(portugal ? { portugal: true } : {}) });
      toast({ title: temaId ? 'Tema trocado 🎉' : portugal ? 'Voltou para o mesmo tema do Brasil' : 'Voltou para o tema automático' });
      await carregar();
    } catch {
      toast({ title: 'Não foi possível trocar o tema.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-fuchsia-500" />
        <p className="font-semibold">Tema de cada noite</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada noite tem um tema, girando sozinho. O tema aparece na página da Casa e nos avisos, e a Lola mistura as brincadeiras dele com as de cada sala.
      </p>
      <ul className="space-y-1.5">
        {noites.map((n) => (
          <li key={n.data} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
            <span className="w-24 text-sm font-medium">{n.dia === 'sabado' ? 'Sáb' : 'Sex'} {dataCurta(n.data)}</span>
            <select value={n.escolhido ? n.tema.id : ''} onChange={(e) => void trocar(n, e.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" aria-label={`Tema de ${dataCurta(n.data)}`}>
              <option value="">Automático: {n.escolhido ? 'voltar ao da sequência' : n.tema.nome}</option>
              {temas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            {n.escolhido && <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-500">escolhido</span>}
          </li>
        ))}
      </ul>
      {noitesPortugal.length > 0 && (
        <>
          <p className="pt-2 font-semibold">🇵🇹 Noites de Portugal (22h de Lisboa)</p>
          <p className="text-xs text-muted-foreground">Sem escolha, a noite de Portugal usa o mesmo tema da noite do Brasil daquela data.</p>
          <ul className="space-y-1.5">
            {noitesPortugal.map((n) => (
              <li key={`pt-${n.data}`} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
                <span className="w-24 text-sm font-medium">{n.dia === 'sabado' ? 'Sáb' : 'Sex'} {dataCurta(n.data)}</span>
                <select value={n.escolhido ? n.tema.id : ''} onChange={(e) => void trocar(n, e.target.value, true)}
                  className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" aria-label={`Tema de Portugal em ${dataCurta(n.data)}`}>
                  <option value="">Igual ao Brasil: {n.escolhido ? 'voltar ao do Brasil' : n.tema.nome}</option>
                  {temas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {n.escolhido && <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-500">escolhido</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
