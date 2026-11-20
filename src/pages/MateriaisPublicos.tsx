import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { promoterService, type PromoterAsset } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';

type Material = Pick<PromoterAsset, 'id' | 'title' | 'caption' | 'destination' | 'createdAt' | 'url' | 'mimeType' | 'quandoPostar'>;

/**
 * Materiais de divulgação por link público (20/11/2026, pedido do dono):
 * quem tem o link baixa as artes ativas da Central sem login. O link é
 * secreto (token) e o admin pode gerar outro, que invalida este.
 */
export default function MateriaisPublicos() {
  const { token = '' } = useParams();
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'invalido' | 'erro'>('carregando');
  const [baixando, setBaixando] = useState('');
  const [copiado, setCopiado] = useState('');

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = 'Materiais de divulgação — NoSigilo';
    return () => { meta.remove(); };
  }, []);

  const carregar = async () => {
    setEstado('carregando');
    try {
      setMateriais((await promoterService.publicAssets(token)).assets);
      setEstado('ok');
    } catch (e: any) {
      setEstado(e?.response?.status === 404 ? 'invalido' : 'erro');
    }
  };
  useEffect(() => { void carregar(); }, [token]);

  const baixar = async (m: Material) => {
    setBaixando(m.id);
    try {
      const resposta = await fetch(resolveServerUrl(m.url));
      if (!resposta.ok) throw new Error('download');
      const blob = await resposta.blob();
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `nosigilo-${m.id}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      // Sem fetch (bloqueio do navegador): abre o arquivo para salvar manualmente.
      window.open(resolveServerUrl(m.url), '_blank', 'noopener');
    } finally { setBaixando(''); }
  };

  const copiar = async (m: Material) => {
    try { await navigator.clipboard.writeText(m.caption); setCopiado(m.id); setTimeout(() => setCopiado(''), 2000); } catch { /* texto fica visível para copiar à mão */ }
  };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <BrandLogo />
      <div>
        <h1 className="text-2xl font-bold">Materiais de divulgação</h1>
        <p className="text-sm text-muted-foreground mt-2">Fotos e vídeos oficiais do NoSigilo, com legenda pronta. Toque em "Baixar" para salvar no aparelho.</p>
      </div>
      {estado === 'carregando' && <p role="status">Carregando materiais…</p>}
      {estado === 'invalido' && <p role="alert" className="rounded-2xl border p-6">Este link não é mais válido. Peça o link atualizado para quem enviou.</p>}
      {estado === 'erro' && <div role="alert" className="space-y-3"><p>Não foi possível carregar os materiais.</p><Button variant="outline" onClick={() => void carregar()}>Tentar novamente</Button></div>}
      {estado === 'ok' && !materiais.length && <p className="rounded-2xl border p-6 text-muted-foreground">Nenhum material disponível no momento.</p>}
      {estado === 'ok' && materiais.length > 0 && <div className="grid gap-4 sm:grid-cols-2">
        {materiais.map((m) => <article key={m.id} className="rounded-2xl border overflow-hidden bg-card">
          {m.mimeType.startsWith('video/')
            ? <video src={resolveServerUrl(m.url)} controls playsInline preload="metadata" aria-label={m.title} className="w-full h-80 object-contain bg-black" />
            : <img src={resolveServerUrl(m.url)} alt={m.title} loading="lazy" className="w-full h-80 object-contain bg-black/20" />}
          <div className="p-4 space-y-3">
            <h2 className="font-semibold">{m.title}</h2>
            <p className="text-xs text-muted-foreground">{m.destination === 'casa' ? 'A Casa' : 'Comunidade'}{m.quandoPostar ? ` · 📅 Postar ${m.quandoPostar}` : ''}</p>
            {m.caption && <p className="text-sm whitespace-pre-wrap">{m.caption}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!!baixando} onClick={() => void baixar(m)}>{baixando === m.id ? 'Baixando…' : m.mimeType.startsWith('video/') ? 'Baixar vídeo' : 'Baixar foto'}</Button>
              <Button variant="outline" disabled={!m.caption} onClick={() => void copiar(m)}>{copiado === m.id ? 'Copiado!' : 'Copiar legenda'}</Button>
            </div>
          </div>
        </article>)}
      </div>}
    </div>
  </main>;
}
