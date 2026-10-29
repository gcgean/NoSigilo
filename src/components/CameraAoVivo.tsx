import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Câmera da cabine: foto ou vídeo DE AGORA (nada da galeria), vídeo até 60s.
// Sem câmera no navegador (permissão negada, navegador antigo), cai no
// seletor nativo do aparelho via onSemCamera.
export const MAX_VIDEO_SEG = 60;

function tipoDoGravador() {
  const opcoes = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  return opcoes.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

export default function CameraAoVivo({ open, onClose, onPronto, onSemCamera }: {
  open: boolean;
  onClose: () => void;
  onPronto: (arquivo: File) => void;
  onSemCamera: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const [frente, setFrente] = useState(true);
  const [modo, setModo] = useState<'foto' | 'video'>('foto');
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [pronto, setPronto] = useState<{ arquivo: File; url: string } | null>(null);

  const parar = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open || pronto) return;
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem_camera');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: frente ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        }).catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: frente ? 'user' : 'environment' } }));
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        parar();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelado) { onClose(); onSemCamera(); }
      }
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, frente, pronto]);

  // Fechou: desliga a câmera e descarta o que não foi enviado.
  useEffect(() => {
    if (open) return;
    if (gravadorRef.current?.state === 'recording') gravadorRef.current.stop();
    parar();
    setGravando(false);
    setSegundos(0);
    setPronto((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  }, [open]);

  useEffect(() => () => parar(), []);

  // Cronômetro do vídeo: para sozinho em 60s.
  useEffect(() => {
    if (!gravando) return;
    const t = window.setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAX_VIDEO_SEG) gravadorRef.current?.stop();
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [gravando]);

  const tirarFoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // A câmera da frente aparece espelhada: a foto sai como a pessoa viu.
    if (frente) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const arquivo = new File([blob], `cabine-${Date.now()}.jpg`, { type: 'image/jpeg' });
      parar();
      setPronto({ arquivo, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.9);
  };

  const gravar = () => {
    const stream = streamRef.current;
    const tipo = tipoDoGravador();
    if (!stream || tipo === null) { onClose(); onSemCamera(); return; }
    pedacosRef.current = [];
    const rec = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size > 0) pedacosRef.current.push(e.data); };
    rec.onstop = () => {
      setGravando(false);
      // O servidor só aceita o tipo puro (sem ";codecs=...").
      const mime = (rec.mimeType || tipo || 'video/webm').split(';')[0];
      const blob = new Blob(pedacosRef.current, { type: mime });
      if (blob.size === 0) return;
      const arquivo = new File([blob], `cabine-${Date.now()}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime });
      parar();
      setPronto({ arquivo, url: URL.createObjectURL(blob) });
    };
    gravadorRef.current = rec;
    rec.start(1000);
    setSegundos(0);
    setGravando(true);
  };

  const refazer = () => {
    setPronto((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
    setSegundos(0);
  };

  if (!open) return null;
  const restante = MAX_VIDEO_SEG - segundos;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label="Fechar câmera">
          <X className="h-5 w-5" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-rose-300">
          {pronto ? 'Ficou bom?' : gravando ? `● Gravando · ${restante}s` : 'Ao vivo · só a cabine vê'}
        </span>
        {!pronto && !gravando ? (
          <button type="button" onClick={() => setFrente((f) => !f)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label="Trocar câmera">
            <RefreshCw className="h-5 w-5" />
          </button>
        ) : <span className="w-10" />}
      </div>

      <div className="relative min-h-0 flex-1">
        {pronto ? (
          pronto.arquivo.type.startsWith('video/')
            ? <video src={pronto.url} className="h-full w-full object-contain" controls autoPlay playsInline loop />
            : <img src={pronto.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <video ref={videoRef} muted playsInline autoPlay className={cn('h-full w-full object-cover', frente && '-scale-x-100')} />
        )}
        {gravando && (
          <div className="absolute inset-x-0 top-0 h-1 bg-white/10">
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${(segundos / MAX_VIDEO_SEG) * 100}%` }} />
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {pronto ? (
          <div className="flex gap-3">
            <button type="button" onClick={refazer} className="flex-1 rounded-full bg-white/10 py-3 text-sm font-semibold">Refazer</button>
            <button
              type="button"
              onClick={() => { onPronto(pronto.arquivo); onClose(); }}
              className="flex-1 rounded-full bg-gradient-to-r from-rose-600 to-fuchsia-600 py-3 text-sm font-bold"
            >
              Enviar (visualização única)
            </button>
          </div>
        ) : (
          <>
            {!gravando && (
              <div className="mx-auto grid w-48 grid-cols-2 gap-1 rounded-full bg-white/10 p-1 text-xs">
                <button type="button" onClick={() => setModo('foto')} className={cn('rounded-full py-1.5', modo === 'foto' && 'bg-white font-semibold text-black')}>📸 Foto</button>
                <button type="button" onClick={() => setModo('video')} className={cn('rounded-full py-1.5', modo === 'video' && 'bg-white font-semibold text-black')}>🎥 Vídeo</button>
              </div>
            )}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => (modo === 'foto' ? tirarFoto() : gravando ? gravadorRef.current?.stop() : gravar())}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white"
                aria-label={modo === 'foto' ? 'Tirar foto' : gravando ? 'Parar gravação' : 'Gravar vídeo'}
              >
                <span className={cn(
                  'block transition-all',
                  modo === 'foto' ? 'h-14 w-14 rounded-full bg-white' : gravando ? 'h-7 w-7 rounded-md bg-rose-500' : 'h-14 w-14 rounded-full bg-rose-500',
                )} />
              </button>
            </div>
            <p className="text-center text-[11px] text-white/50">
              {modo === 'video' ? `Vídeo de até ${MAX_VIDEO_SEG} segundos. ` : ''}Quem está na cabine abre 1 vez.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
