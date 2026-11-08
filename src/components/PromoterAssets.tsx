import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { invitesService, profileService, promoterService, type PromoterAsset } from '@/services/api';
import { getSiteUrl, resolveServerUrl } from '@/utils/serverUrl';
import PromoterSharingGuide from '@/components/PromoterSharingGuide';

export default function PromoterAssets({ admin = false }: { admin?: boolean }) {
  const { toast } = useToast();
  const [assets, setAssets] = useState<PromoterAsset[]>([]);
  const [invite, setInvite] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState('');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [destination, setDestination] = useState<'community' | 'casa'>('community');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState('all');
  const [seenBusy, setSeenBusy] = useState(false);
  const [uploadedMediaId, setUploadedMediaId] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const load = async () => {
    setLoading(true); setError(false);
    try {
      const data = await promoterService.assets(); setAssets(data.assets);
      if (!admin) {
        const links = await invitesService.listMine();
        setInvite(links.find((i: { status: string }) => i.status === 'created')?.token || '');
      }
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try { const data = await promoterService.assets(); if (active) setAssets(data.assets); } catch { /* Mantém os materiais já carregados. */ }
    };
    const timer = setInterval(() => void refresh(), 60000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [admin]);
  const newAssets = assets.filter((asset) => asset.isNew);
  const visibleAssets = assets.filter((asset) => filter === 'all' || (filter === 'new' ? asset.isNew : filter === 'video' ? asset.mimeType.startsWith('video/') : asset.mimeType.startsWith('image/')));
  const markSeen = async () => {
    setSeenBusy(true);
    try {
      const ids = newAssets.map((asset) => asset.id);
      for (let i = 0; i < ids.length; i += 100) await promoterService.markAssetsSeen(ids.slice(i, i + 100));
      setAssets((current) => current.map((asset) => ids.includes(asset.id) ? { ...asset, isNew: false } : asset));
      toast({ title: 'Novidades marcadas como vistas' });
    } catch { fail(); } finally { setSeenBusy(false); }
  };
  const linkFor = (asset: PromoterAsset) => asset.destination === 'casa' ? `${getSiteUrl()}/acasa?invite=${encodeURIComponent(invite)}` : `${getSiteUrl()}/invite/${encodeURIComponent(invite)}`;
  const fail = () => toast({ title: 'Não foi possível concluir', description: 'Tente novamente.', variant: 'destructive' });
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast({ title: 'Copiado!' }); } catch { toast({ title: 'Selecione e copie o texto exibido abaixo.' }); } };
  const publish = async () => {
    if (!file || !title.trim() || busy) return;
    setBusy('publish');
    try {
      let mediaId = uploadedMediaId;
      if (!mediaId) {
        const uploaded = await profileService.uploadMedia(file, { source: 'chat' }, setProgress);
        mediaId = uploaded.id; setUploadedMediaId(mediaId);
      }
      await promoterService.publishAsset({ title: title.trim(), caption: caption.trim(), destination, mediaId });
      setTitle(''); setCaption(''); setFile(null); setUploadedMediaId(''); setProgress(0); setInputKey((k) => k + 1);
      toast({ title: 'Material publicado', description: 'O aviso aparece somente na área do promotor. Vídeos em processamento são liberados quando ficam prontos.' }); await load();
    } catch { fail(); } finally { setBusy(''); }
  };
  const download = async (asset: PromoterAsset, share: boolean) => {
    setBusy(asset.id);
    try {
      const response = await fetch(resolveServerUrl(asset.url));
      if (!response.ok) throw new Error('download');
      const blob = await response.blob();
      const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const picture = new File([blob], `nosigilo-${asset.id}.${extension}`, { type: blob.type });
      if (share && navigator.canShare?.({ files: [picture] })) {
        try {
          await navigator.share({ files: [picture], text: `${asset.caption}\n${linkFor(asset)}` });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Alguns navegadores perdem a autorização de compartilhar durante o download.
          // O arquivo continua disponível para publicar manualmente.
        }
      }
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = picture.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast({ title: 'Material baixado', description: 'Copie seu link: use na bio e no adesivo de link do story.' });
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) fail(); }
    finally { setBusy(''); }
  };
  return <section className="max-w-4xl mx-auto w-full space-y-5 pb-6">
    {!admin && <Link to="/promoter" className="inline-block py-3 text-primary">← Voltar ao meu painel</Link>}
    <div><h1 className="text-2xl font-bold">Central de divulgação</h1><p className="text-sm text-muted-foreground mt-2">Fotos, vídeos e textos oficiais para divulgar com a sua indicação.</p>{admin && <Button variant="outline" className="mt-3" onClick={() => void copy(`${getSiteUrl()}/promoter/artes`)}>Copiar endereço da central</Button>}</div>
    {admin ? <div className="glass rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold">Publicar foto ou vídeo</h2>
      <label className="block text-sm space-y-2"><span>Título</span><Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block text-sm space-y-2"><span>Legenda sugerida (o link individual será adicionado pelo promotor)</span><textarea className="w-full rounded-xl border bg-background p-3" rows={3} maxLength={2000} value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
      <label className="block text-sm space-y-2"><span>Destino do convite</span><select className="block w-full rounded-xl border bg-background p-3" value={destination} onChange={(e) => setDestination(e.target.value as 'community' | 'casa')}><option value="community">Comunidade</option><option value="casa">A Casa</option></select></label>
      <label className="block text-sm space-y-2"><span>Foto: JPG, PNG ou WebP até 10 MB. Vídeo: MP4, MOV ou WebM até 100 MB.</span><input key={inputKey} disabled={!!busy} className="block w-full min-w-0" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => {
        const chosen = e.target.files?.[0];
        setUploadedMediaId(''); setProgress(0);
        if (chosen && (!['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'].includes(chosen.type) || chosen.size > (chosen.type.startsWith('video/') ? 100 : 10) * 1024 * 1024)) {
          toast({ title: 'Arquivo não aceito', description: 'Escolha um dos formatos e limites informados.' }); e.target.value = ''; setFile(null); return;
        }
        setFile(chosen || null);
      }} /></label>
      <p className="text-xs text-muted-foreground">Prefira formato vertical 9:16 (1080 × 1920) para stories e Reels. O promotor adiciona o próprio link ao publicar. A novidade aparece somente na área dos promotores.</p>
      {preview && (file?.type.startsWith('video/') ? <video src={preview} controls playsInline preload="metadata" className="w-full max-h-80 rounded-xl bg-black" aria-label="Prévia do vídeo" /> : <img src={preview} alt="Prévia da arte a publicar" className="max-h-80 rounded-xl object-contain mx-auto" />)}
      {busy === 'publish' && <div role="status" className="space-y-2"><progress className="w-full accent-pink-500" max={100} value={progress} /><p className="text-sm">{progress < 100 ? `Enviando: ${progress}%` : 'Envio concluído. Preparando a publicação…'}</p></div>}
      <Button disabled={!!busy || !file || !title.trim()} onClick={() => void publish()}>{busy === 'publish' ? 'Publicando…' : 'Publicar para os promotores'}</Button>
    </div> : <>
      <PromoterSharingGuide inviteUrl={invite ? `${getSiteUrl()}/invite/${encodeURIComponent(invite)}` : ''} copy={copy} />
      {!loading && !error && !invite && <Button asChild variant="outline"><Link to="/promoter">Gere seu convite no painel para começar</Link></Button>}
      {newAssets.length > 0 && <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="font-semibold">{newAssets.length} {newAssets.length === 1 ? 'material novo para você' : 'materiais novos para você'}</p><Button variant="outline" disabled={seenBusy} onClick={() => void markSeen()}>{seenBusy ? 'Salvando…' : 'Marcar novidades como vistas'}</Button></div>}
    </>}
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm">Mostrar<select className="rounded-xl border bg-background p-3" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos os materiais</option>{!admin && <option value="new">Novidades</option>}<option value="image">Fotos</option><option value="video">Vídeos</option></select></label><Button variant="outline" disabled={loading || !!busy} onClick={() => void load()}>Atualizar materiais</Button></div>
    {loading ? <p role="status">Carregando artes…</p> : error ? <div role="alert"><p>Não foi possível carregar a central.</p><Button onClick={() => void load()} variant="outline">Tentar novamente</Button></div> : !visibleAssets.length ? <p className="rounded-2xl border p-6 text-muted-foreground">Nenhum material nesta seleção. Novas publicações aparecerão aqui.{!admin && ' Enquanto isso, a imagem padrão continua disponível no painel.'}</p> : <div className="grid gap-5 sm:grid-cols-2">
      {visibleAssets.map((asset) => <article key={asset.id} className="glass rounded-2xl overflow-hidden min-w-0">
        {asset.processing ? <div role="status" className="h-60 grid place-items-center bg-secondary/30 p-6 text-center">Vídeo em processamento. Será liberado automaticamente quando estiver pronto.</div> : asset.mimeType.startsWith('video/') ? <video src={resolveServerUrl(asset.url)} controls playsInline preload="metadata" aria-label={asset.title} className="w-full h-80 object-contain bg-black/20" /> : <img src={resolveServerUrl(asset.url)} alt={asset.title} loading="lazy" className="w-full h-80 object-contain bg-black/20" />}
        <div className="p-4 space-y-3"><h2 className="font-semibold break-words">{asset.title}</h2>{!admin && asset.isNew && <span className="inline-block rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-semibold">Novo</span>}<p className="text-xs text-muted-foreground">{new Date(asset.createdAt).toLocaleDateString('pt-BR')} · {asset.destination === 'casa' ? 'A Casa' : 'Comunidade'}</p><p className="text-sm whitespace-pre-wrap break-words">{asset.caption}</p>
          {admin ? <Button disabled={!!busy} variant="outline" onClick={async () => { setBusy(asset.id); try { await promoterService.removeAsset(asset.id); await load(); } catch { fail(); } finally { setBusy(''); } }}>Retirar da central</Button> : <>
            {invite && <input aria-label={`Seu link para ${asset.title}`} readOnly value={linkFor(asset)} onFocus={(e) => e.currentTarget.select()} className="w-full min-w-0 rounded-lg border bg-background p-3 text-xs" />}
            <div className="grid grid-cols-2 gap-2 [&>button]:px-2 [&>button]:text-xs [&>button]:min-h-11 [&>button]:whitespace-normal"><Button disabled={!!busy} variant="outline" onClick={() => void download(asset, false)}>{asset.mimeType.startsWith('video/') ? 'Baixar vídeo' : 'Baixar foto'}</Button><Button disabled={!!busy || !invite} onClick={() => void download(asset, true)}>Compartilhar</Button><Button disabled={!invite} variant="outline" onClick={() => void copy(linkFor(asset))}>Copiar link</Button><Button disabled={!invite} variant="outline" onClick={() => void copy(`${asset.caption}\nEntre pelo link da minha bio ou pelo meu convite: ${linkFor(asset)}`)}>Copiar legenda</Button></div>
          </>}
        </div>
      </article>)}
    </div>}
  </section>;
}
