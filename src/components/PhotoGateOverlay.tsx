import { useRef, useState } from 'react';
import { Camera, ImagePlus, ArrowRight, Eye, Heart, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { profileService, feedService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const EXEMPT_PATHS = ['/profile', '/settings', '/subscriptions', '/plans'];

export default function PhotoGateOverlay({ pathname }: { pathname: string }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Don't show overlay on exempt routes, if user already has a photo, or if admin
  const isExempt = EXEMPT_PATHS.some((p) => pathname.startsWith(p));
  if (!user || user.avatar || user.isAdmin || isExempt) return null;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Envie apenas imagens (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('A imagem deve ter menos de 20 MB.');
      return;
    }
    setErrorMsg(null);
    setPreviewUrl(URL.createObjectURL(file));
    setIsUploading(true);
    setUploadProgress('uploading');
    try {
      const uploaded = await profileService.uploadMedia(file, { isPrivate: false, source: 'profile' });
      const mediaId = uploaded?.id ? String(uploaded.id) : '';
      const url = uploaded?.url ? String(uploaded.url) : '';
      if (mediaId) {
        await profileService.setMainPhoto(mediaId);
        try { await feedService.createPost({ content: '', mediaIds: [mediaId] }); } catch {}
      }
      if (url) updateUser({ avatar: resolveServerUrl(url) });
      setUploadProgress('done');
    } catch {
      setErrorMsg('Erro ao enviar a foto. Tente novamente.');
      setUploadProgress('idle');
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const stats = [
    { icon: Eye,   value: '4×',   label: 'mais visitas ao perfil' },
    { icon: Heart, value: '8×',   label: 'mais matches recebidos' },
    { icon: Zap,   value: '100%', label: 'necessário para aparecer na busca' },
  ];

  // z-[35] fica ABAIXO do header (z-40) e do nav inferior (z-40):
  // usuário navega normalmente pelo header/nav mas não interage com o conteúdo bloqueado.
  return (
    <div className="fixed inset-x-0 top-14 sm:top-16 bottom-0 z-[35] flex flex-col">
      {/* Blurred frosted background */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />

      {/* Gradient accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-violet-500/15 blur-[80px]" />
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-md">

          {/* Card */}
          <div className="overflow-hidden rounded-3xl border border-primary/20 bg-background/95 shadow-2xl shadow-primary/10">

            {/* Top gradient strip */}
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-violet-500 to-rose-500" />

            <div className="p-6 sm:p-8 space-y-6">
              {/* Icon + headline */}
              <div className="text-center space-y-3">
                <div className="relative mx-auto w-fit">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mx-auto">
                    <Camera className="h-10 w-10 text-primary" />
                  </div>
                  <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white shadow-lg">
                    !
                  </span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold leading-tight">
                    Seu perfil está invisível
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    Perfis sem foto não aparecem na busca, no match ou no feed.
                    Adicione sua foto agora para começar a fazer conexões.
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {stats.map(({ icon: Icon, value, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-primary/5 p-3 text-center">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-lg font-bold text-primary leading-none">{value}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
                  </div>
                ))}
              </div>

              {/* Upload zone */}
              {uploadProgress === 'done' ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/8 p-6 text-center">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Foto de perfil"
                      className="h-24 w-24 rounded-full object-cover ring-4 ring-emerald-400/50"
                    />
                  )}
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Foto enviada com sucesso! 🎉
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Você agora é visível na plataforma.
                  </p>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-all',
                    isDragging
                      ? 'border-primary bg-primary/8 scale-[1.01]'
                      : 'border-border hover:border-primary/60 hover:bg-primary/4',
                    isUploading && 'pointer-events-none opacity-70'
                  )}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-24 w-24 rounded-full object-cover ring-4 ring-primary/30"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <ImagePlus className="h-8 w-8 text-primary" />
                    </div>
                  )}

                  {isUploading ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Enviando foto...
                      </div>
                      <p className="text-xs text-muted-foreground">Aguarde um momento</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold">
                        {isDragging ? 'Solte aqui!' : 'Clique ou arraste sua foto'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        JPG, PNG ou WEBP · máx 20 MB
                      </p>
                    </div>
                  )}

                  {errorMsg && (
                    <p className="absolute -bottom-6 left-0 right-0 text-center text-xs text-destructive">
                      {errorMsg}
                    </p>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onInputChange}
                capture="user"
              />

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                {uploadProgress !== 'done' && (
                  <Button
                    className="w-full bg-gradient-to-r from-primary to-violet-500 text-base font-semibold py-5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    {isUploading ? 'Enviando...' : 'Adicionar foto aqui'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground text-sm"
                  onClick={() => navigate('/profile')}
                >
                  Ou acesse o menu Perfil para adicionar
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground/60">
            Use o menu acima para navegar até Perfil ou Configurações e adicionar sua foto.
          </p>
        </div>
      </div>
    </div>
  );
}
