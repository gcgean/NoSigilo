import { HelpCircle, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const HELP_VIDEO_URL = import.meta.env.VITE_HELP_VIDEO_URL || 'https://www.youtube.com';

function qrUrl(data: string) {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}`;
}

export default function HelpButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ajuda">
          <HelpCircle className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajuda rápida</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Assista ao vídeo de ajuda no celular escaneando o QR Code ou abrindo o link.
          </p>
          <div className="flex items-center gap-4">
            <div className="rounded-lg border p-2 bg-background">
              <img src={qrUrl(HELP_VIDEO_URL)} alt="QR Code do vídeo de ajuda" className="w-[180px] h-[180px]" />
            </div>
            <div className="flex-1 space-y-3">
              <Button asChild className="w-full bg-gradient-primary hover:opacity-90 gap-2">
                <a href={HELP_VIDEO_URL} target="_blank" rel="noreferrer">
                  <QrCode className="w-4 h-4" /> Abrir vídeo
                </a>
              </Button>
              <p className="text-xs text-muted-foreground break-all">{HELP_VIDEO_URL}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

