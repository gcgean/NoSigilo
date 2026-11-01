import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import CenaDaSala, { type FotoDeFundo } from '@/components/CenaDaSala';

/**
 * Admin: foto de fundo de cada sala d'A Casa. O app já aplica o efeito de papel de
 * parede (preto e branco, desfoque leve e a cor da sala), então basta subir a foto.
 */
type SalaDoAdmin = { id: string; nome: string; emoji: string };

export default function FundosDaCasa() {
  const { toast } = useToast();
  const [salas, setSalas] = useState<SalaDoAdmin[]>([]);
  const [fundos, setFundos] = useState<Record<string, FotoDeFundo | null>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/casa/admin/fundos');
      setSalas(data.salas ?? []);
      setFundos(data.fundos ?? {});
    } catch { /* sem acesso */ }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const enviar = async (salaId: string, arquivo: File) => {
    setEnviando(salaId);
    try {
      const form = new FormData();
      form.append('arquivo', arquivo);
      await apiClient.post(`/casa/admin/fundos/${salaId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast({ title: 'Fundo atualizado 🖼️', description: 'Quem entrar na sala a partir de agora já vê.' });
      await carregar();
    } catch (e) {
      toast({ title: (e as any)?.response?.data?.message || 'Não foi possível enviar.', variant: 'destructive' });
    } finally {
      setEnviando(null);
    }
  };
  // O controle mexe na prévia na hora; o servidor só recebe quando solta.
  const mudarIntensidade = (salaId: string, intensidade: number) => {
    setFundos((f) => (f[salaId] ? { ...f, [salaId]: { ...f[salaId]!, intensidade } } : f));
  };
  const salvarIntensidade = async (salaId: string) => {
    const f = fundos[salaId];
    if (f) await apiClient.post(`/casa/admin/fundos/${salaId}/intensidade`, { intensidade: f.intensidade }).catch(() => {});
  };
  const remover = async (s: SalaDoAdmin) => {
    if (!window.confirm(`Tirar a foto de fundo de ${s.nome}?`)) return;
    await apiClient.delete(`/casa/admin/fundos/${s.id}`).catch(() => {});
    await carregar();
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-fuchsia-500" />
        <p className="font-semibold">Fundo das salas</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Escolha uma foto para cada sala. O app deixa em preto e branco, desfoca um pouco e pinta com a cor da sala, como papel de parede atrás do chat.
        Use só fotos que você tem direito de usar e, se aparecer alguém, com autorização de todas as pessoas da foto.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {salas.map((s) => {
          const f = fundos[s.id] ?? null;
          return (
            <div key={s.id} className="space-y-2 rounded-xl border p-2">
              <div className="relative isolate h-40 overflow-hidden rounded-lg bg-black text-white">
                <CenaDaSala salaId={s.id} foto={f} />
                <div className="absolute inset-x-2 bottom-2 space-y-1">
                  <p className="w-fit rounded-2xl bg-white/10 px-2 py-1 text-[11px] backdrop-blur">Boa noite, gente 😈</p>
                  <p className="ml-auto w-fit rounded-2xl bg-rose-600/80 px-2 py-1 text-[11px]">Chegando agora 🔥</p>
                </div>
                <p className="absolute left-2 top-2 text-sm font-semibold drop-shadow">{s.emoji} {s.nome}</p>
              </div>
              {f && (
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  Intensidade
                  <input
                    type="range" min={0.1} max={0.6} step={0.05} value={f.intensidade}
                    onChange={(e) => mudarIntensidade(s.id, Number(e.target.value))}
                    onPointerUp={() => void salvarIntensidade(s.id)}
                    onKeyUp={() => void salvarIntensidade(s.id)}
                    className="flex-1"
                  />
                  {Math.round(f.intensidade * 100)}%
                </label>
              )}
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1" disabled={enviando === s.id}>
                  <label className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />{enviando === s.id ? 'Enviando…' : f ? 'Trocar foto' : 'Escolher foto'}
                    <input
                      type="file" accept="image/*" className="hidden" disabled={enviando === s.id}
                      onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void enviar(s.id, a); }}
                    />
                  </label>
                </Button>
                {f && (
                  <button type="button" onClick={() => void remover(s)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label="Remover fundo">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
