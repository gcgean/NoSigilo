import { useCallback, useEffect, useState } from 'react';
import { DoorClosed, Trash2, Upload } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import CenaDaSala from '@/components/CenaDaSala';

/**
 * Admin: galeria de fotos de fundo das cabines. Cada cabine sorteia uma foto ao
 * abrir, com o mesmo efeito de papel de parede das salas, na cor vermelha da cabine.
 */
type Foto = { arquivo: string; url: string };
type Galeria = { fotos: Foto[]; intensidade: number; limite: number };

export default function FundosDasCabines() {
  const { toast } = useToast();
  const [galeria, setGaleria] = useState<Galeria | null>(null);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);

  const carregar = useCallback(async () => {
    try { setGaleria((await apiClient.get('/casa/admin/fundos-cabines')).data); } catch { /* sem acesso */ }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  // Uma foto por vez: dá para mostrar o progresso, e uma foto ruim não derruba as outras.
  const enviar = async (arquivos: File[]) => {
    let enviadas = 0;
    let erro = '';
    for (const [i, arquivo] of arquivos.entries()) {
      setEnviando({ atual: i + 1, total: arquivos.length });
      try {
        const form = new FormData();
        form.append('arquivo', arquivo);
        const { data } = await apiClient.post('/casa/admin/fundos-cabines', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        setGaleria(data);
        enviadas += 1;
      } catch (e) {
        erro = (e as any)?.response?.data?.message || 'Não foi possível enviar.';
      }
    }
    setEnviando(null);
    if (erro) {
      toast({ title: `${enviadas} de ${arquivos.length} foto(s) enviada(s)`, description: erro, variant: 'destructive' });
    } else {
      toast({ title: `${enviadas} foto(s) na galeria 🖼️`, description: 'As próximas cabines já podem sortear essas fotos.' });
    }
  };
  // O controle mexe na prévia na hora; o servidor só recebe quando solta.
  const mudarIntensidade = (intensidade: number) => setGaleria((g) => (g ? { ...g, intensidade } : g));
  const salvarIntensidade = async () => {
    if (!galeria) return;
    await apiClient.post('/casa/admin/fundos-cabines/intensidade', { intensidade: galeria.intensidade })
      .catch(() => toast({ title: 'Não foi possível salvar a intensidade.', variant: 'destructive' }));
  };
  const remover = async (foto: Foto) => {
    if (!window.confirm('Tirar esta foto da galeria? Cabine aberta com ela volta ao fundo padrão.')) return;
    try {
      setGaleria((await apiClient.delete(`/casa/admin/fundos-cabines/${foto.arquivo}`)).data);
    } catch {
      toast({ title: 'Não foi possível remover.', variant: 'destructive' });
    }
  };

  const fotos = galeria?.fotos ?? [];
  const cheia = !!galeria && fotos.length >= galeria.limite;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DoorClosed className="h-5 w-5 text-rose-500" />
          <p className="font-semibold">Fundo das cabines</p>
          {galeria && <span className="text-xs text-muted-foreground">{fotos.length}/{galeria.limite}</span>}
        </div>
        <Button asChild size="sm" variant="outline" disabled={!!enviando || cheia}>
          <label className={enviando || cheia ? 'pointer-events-none opacity-60' : 'cursor-pointer'}>
            <Upload className="mr-2 h-4 w-4" />
            {enviando ? `Enviando ${enviando.atual} de ${enviando.total}…` : 'Adicionar fotos'}
            <input
              type="file" accept="image/*" multiple className="hidden" disabled={!!enviando || cheia}
              onChange={(e) => { const lista = Array.from(e.target.files ?? []); e.target.value = ''; if (lista.length) void enviar(lista); }}
            />
          </label>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada cabine sorteia uma foto ao abrir e fica com ela até fechar. Enquanto houver foto sobrando, cabines abertas ao mesmo tempo não repetem.
        Sem nenhuma foto, as cabines usam o fundo padrão. Use só fotos que você tem direito de usar e, se aparecer alguém, com autorização de todas as pessoas da foto.
      </p>
      {fotos.length > 0 && galeria && (
        <>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Intensidade
            <input
              type="range" min={0.1} max={0.6} step={0.05} value={galeria.intensidade}
              onChange={(e) => mudarIntensidade(Number(e.target.value))}
              onPointerUp={() => void salvarIntensidade()}
              onKeyUp={() => void salvarIntensidade()}
              className="flex-1"
            />
            {Math.round(galeria.intensidade * 100)}%
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {fotos.map((foto) => (
              <div key={foto.arquivo} className="relative isolate h-40 overflow-hidden rounded-lg bg-black">
                <CenaDaSala salaId="quarto" foto={{ url: foto.url, intensidade: galeria.intensidade }} />
                <button
                  type="button" onClick={() => void remover(foto)} aria-label="Remover foto"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
