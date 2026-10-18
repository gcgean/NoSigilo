import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Music2, Trash2, Upload } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

/**
 * Admin: playlist da rádio d'A Casa. Só músicas livres para uso comercial
 * (ex.: Pixabay Music) — tocar música com direito autoral exige ECAD.
 */
type Faixa = { id: string; titulo: string; artista: string; fonte: string; duracao: number; url: string; tipo?: 'musica' | 'vinheta' | 'abertura' | 'fechamento' };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function PlaylistDaCasa() {
  const { toast } = useToast();
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [fonte, setFonte] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [tipo, setTipo] = useState<'musica' | 'vinheta' | 'abertura' | 'fechamento'>('musica');

  const carregar = useCallback(async () => {
    try { setFaixas((await apiClient.get('/casa/admin/playlist')).data.faixas ?? []); } catch { /* sem acesso */ }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const enviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('titulo', titulo || arquivo.name.replace(/\.[^.]+$/, ''));
      form.append('artista', artista);
      form.append('fonte', fonte);
      form.append('tipo', tipo);
      form.append('arquivo', arquivo);
      await apiClient.post('/casa/admin/playlist', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setArquivo(null); setTitulo(''); setArtista('');
      toast({ title: 'Música adicionada 🎵' });
      await carregar();
    } catch (e) {
      toast({ title: (e as any)?.response?.data?.message || 'Não foi possível enviar.', variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };
  const mover = async (id: string, direcao: 'cima' | 'baixo') => {
    await apiClient.post(`/casa/admin/playlist/${id}/mover`, { direcao }).catch(() => {});
    await carregar();
  };
  const trocarTipo = async (f: Faixa, tipo: string) => {
    await apiClient.post(`/casa/admin/playlist/${f.id}/tipo`, { tipo }).catch(() => {});
    await carregar();
  };
  const excluir = async (f: Faixa) => {
    if (!window.confirm(`Tirar "${f.titulo}" da playlist?`)) return;
    await apiClient.delete(`/casa/admin/playlist/${f.id}`).catch(() => {});
    await carregar();
  };

  const total = faixas.reduce((s, f) => s + f.duracao, 0);
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Music2 className="h-5 w-5 text-fuchsia-500" />
        <p className="font-semibold">Rádio da Casa</p>
        <span className="text-xs text-muted-foreground">{faixas.length} música(s) · {mmss(total)} no total</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Use só músicas livres para uso comercial (ex.: Pixabay Music). Música com direito autoral tocada para o público exige ECAD.
        Todo mundo na Casa ouve a mesma faixa ao mesmo tempo, na ordem abaixo, em repetição.
      </p>

      <div className="grid gap-2 rounded-xl border border-dashed p-3">
        <div className="flex gap-2">
          <Button size="sm" variant={tipo === 'musica' ? 'default' : 'outline'} onClick={() => setTipo('musica')}>🎵 Música</Button>
          <Button size="sm" variant={tipo === 'vinheta' ? 'default' : 'outline'} onClick={() => setTipo('vinheta')}>💋 Vinheta da Lola</Button>
          <Button size="sm" variant={tipo === 'abertura' ? 'default' : 'outline'} onClick={() => setTipo('abertura')}>🌙 Abertura (21h)</Button>
          <Button size="sm" variant={tipo === 'fechamento' ? 'default' : 'outline'} onClick={() => setTipo('fechamento')}>🌅 Fechamento (1h)</Button>
        </div>
        {tipo === 'abertura' && <p className="text-[11px] text-muted-foreground">Toca uma vez, assim que a Casa abre às 21h. Se houver mais de uma, vale a primeira da lista.</p>}
        {tipo === 'fechamento' && <p className="text-[11px] text-muted-foreground">Toca no fim da noite, terminando exatamente à 1h.</p>}
        {tipo === 'vinheta' && <p className="text-[11px] text-muted-foreground">Vinhetas tocam entre as músicas: uma a cada 2 músicas, revezando entre as que você subir.</p>}
        <input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="text-xs" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional)" className="rounded-lg border bg-background px-3 py-2 text-sm" />
          <input value={artista} onChange={(e) => setArtista(e.target.value)} placeholder="Artista" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>
        <input value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="Fonte/licença (ex.: link do Pixabay)" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <Button size="sm" disabled={!arquivo || enviando} onClick={() => void enviar()}>
          <Upload className="mr-2 h-4 w-4" />{enviando ? 'Enviando…' : 'Adicionar à playlist'}
        </Button>
      </div>

      <ol className="space-y-1.5">
        {faixas.map((f, i) => (
          <li key={f.id} className="flex items-center gap-2 rounded-xl border p-2">
            <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.tipo === 'vinheta' ? '💋 ' : f.tipo === 'abertura' ? '🌙 ' : f.tipo === 'fechamento' ? '🌅 ' : ''}{f.titulo}{f.tipo && f.tipo !== 'musica' && <span className="ml-1 rounded-full bg-fuchsia-500/15 px-1.5 text-[10px] text-fuchsia-500">{f.tipo === 'vinheta' ? 'vinheta' : f.tipo === 'abertura' ? 'abertura 21h' : 'fechamento 1h'}</span>}</p>
              <p className="truncate text-[11px] text-muted-foreground">{f.artista || 'sem artista'} · {mmss(f.duracao)}{f.fonte ? ` · ${f.fonte}` : ''}</p>
              <div className="mt-1 flex items-center gap-2">
                <audio src={resolveServerUrl(f.url)} controls preload="none" className="h-8 min-w-0 flex-1" />
                <select value={f.tipo ?? 'musica'} onChange={(e) => void trocarTipo(f, e.target.value)} className="rounded-md border bg-background px-1 py-1 text-[11px]" aria-label="Tipo do áudio">
                  <option value="musica">🎵 Música</option>
                  <option value="vinheta">💋 Vinheta</option>
                  <option value="abertura">🌙 Abertura 21h</option>
                  <option value="fechamento">🌅 Fechamento 1h</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col">
              <button type="button" disabled={i === 0} onClick={() => void mover(f.id, 'cima')} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={i === faixas.length - 1} onClick={() => void mover(f.id, 'baixo')} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => void excluir(f)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {faixas.length === 0 && <li className="text-center text-xs text-muted-foreground">Nenhuma música ainda. A rádio só aparece na Casa depois da primeira.</li>}
      </ol>
    </div>
  );
}
