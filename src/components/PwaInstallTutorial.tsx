import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download, Ellipsis, ExternalLink, House, Monitor, Share2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Device = 'ios' | 'android' | 'windows';

function detectDevice(): Device {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'windows';
}

// Navegador de dentro do Instagram/Facebook: dali não dá para instalar. A
// maior parte de quem chega vem do Instagram, então o primeiro passo precisa
// ser sair dele para o Safari/Chrome.
export function emNavegadorDeApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS/i.test(navigator.userAgent || '');
}

function passoSairDoApp(device: Device) {
  const navegador = device === 'ios' ? 'Safari' : 'Chrome';
  return {
    title: `Abra no ${navegador}`,
    detail: device === 'ios'
      ? 'Você está no navegador do Instagram, que não instala apps. Toque nos três pontinhos ⋯ no canto de cima e escolha “Abrir no navegador externo” (ou “Abrir no Safari”). Se não aparecer, copie o link abaixo e cole no Safari.'
      : 'Você está no navegador do Instagram, que não instala apps. Toque nos três pontinhos ⋮ no canto de cima e escolha “Abrir no Chrome” (ou “Abrir no navegador”). Se não aparecer, copie o link abaixo e cole no Chrome.',
    icon: ExternalLink,
    visual: `⋯  Abrir no ${navegador}`,
  };
}

// Vídeos curtos de como instalar, também usados na página pública /instalar.
export type Celular = 'ios' | 'android';
export const videosDeInstalacao: Record<Celular, { src: string; capa: string }> = {
  ios: { src: '/tutoriais/instalar-iphone.mp4', capa: '/tutoriais/instalar-iphone.jpg' },
  android: { src: '/tutoriais/instalar-android.mp4', capa: '/tutoriais/instalar-android.jpg' },
};
export function detectarCelular(): Celular {
  return detectDevice() === 'ios' ? 'ios' : 'android';
}

const guides = {
  ios: {
    name: 'iPhone / iPad', browser: 'Safari',
    steps: [
      { title: 'Abra no Safari', detail: 'Se estiver no navegador de outro aplicativo, abra nosigilo.net no Safari.', icon: Smartphone, visual: 'Safari  ·  nosigilo.net' },
      { title: 'Toque em Compartilhar', detail: 'Se aparecerem três pontinhos ⋯ ao lado do endereço, toque neles e depois em Compartilhar. Se não, toque no ícone de quadrado com seta para cima, embaixo ou em cima da tela.', icon: Share2, visual: '⋯  →  Compartilhar  ↑' },
      { title: 'Escolha “Adicionar à Tela de Início”', detail: 'Role o menu para baixo até encontrar essa opção. Se ela não aparecer, toque em “Ver mais”.', icon: House, visual: '＋  Adicionar à Tela de Início' },
      { title: 'Confirme em “Adicionar”', detail: 'Se aparecer “Abrir como App”, deixe ativado. Depois toque em “Adicionar”. O ícone ficará na tela inicial.', icon: Check, visual: 'NoSigilo.net    Adicionar' },
    ],
  },
  android: {
    name: 'Android', browser: 'Chrome',
    steps: [
      { title: 'Abra no Chrome', detail: 'Acesse nosigilo.net no Google Chrome. Se estiver dentro de outro aplicativo, abra a página no Chrome.', icon: Smartphone, visual: 'Chrome  ·  nosigilo.net' },
      { title: 'Toque nos três pontos', detail: 'O menu ⋮ fica no canto direito do Chrome: em cima ou embaixo da tela, depende do seu celular.', icon: Ellipsis, visual: 'nosigilo.net      ⋮' },
      { title: 'Escolha a opção de instalar', detail: 'Role o menu e toque em “Instalar e criar atalho”. Em alguns celulares, o nome é “Instalar app” ou “Adicionar à tela inicial”.', icon: Download, visual: '↓  Instalar e criar atalho' },
      { title: 'Confirme a instalação', detail: 'Na janela que abrir, toque em “Instalar”. Depois procure o ícone do NoSigilo.net na tela inicial.', icon: Check, visual: 'NoSigilo.net    Instalar' },
    ],
  },
  windows: {
    name: 'Windows', browser: 'Chrome ou Edge',
    steps: [
      { title: 'Abra no Chrome ou Edge', detail: 'Acesse nosigilo.net no navegador do computador.', icon: Monitor, visual: 'Chrome / Edge  ·  nosigilo.net' },
      { title: 'Abra o menu do navegador', detail: 'Clique nos três pontos ⋮ ou ⋯ no canto superior direito.', icon: Ellipsis, visual: 'nosigilo.net      ⋯' },
      { title: 'Escolha instalar como app', detail: 'No Chrome, procure “Transmitir, salvar e compartilhar” > “Instalar página como app”. No Edge, procure “Mais ferramentas” > “Aplicativos” > “Instalar este site como aplicativo”.', icon: Download, visual: '↓  Instalar como aplicativo' },
      { title: 'Confirme em “Instalar”', detail: 'O NoSigilo.net abrirá em uma janela própria. Você também pode fixá-lo na barra de tarefas.', icon: Check, visual: 'NoSigilo.net    Instalar' },
    ],
  },
} as const;
export const guiasDeInstalacao = guides;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall?: () => Promise<void>;
}

export default function PwaInstallTutorial({ open, onOpenChange, onInstall }: Props) {
  const [device, setDevice] = useState<Device>(detectDevice);
  const [step, setStep] = useState(0);
  const [noApp] = useState(emNavegadorDeApp);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (open) {
      setDevice(detectDevice());
      setStep(0);
    }
  }, [open]);

  const guide = guides[device];
  // No navegador do Instagram o passo "abra no Safari/Chrome" vira o passo
  // detalhado; o resto do roteiro é o mesmo.
  const passos = noApp && device !== 'windows' ? [passoSairDoApp(device), ...guide.steps.slice(1)] : guide.steps;
  const current = passos[step];
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText('https://nosigilo.net');
      setCopiado(true);
    } catch { /* sem permissão: a pessoa digita o endereço */ }
  };
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Instale o NoSigilo.net</DialogTitle>
          <DialogDescription>Assista ao vídeo ou siga os passos. A instalação é feita pelo navegador.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2" aria-label="Escolha seu dispositivo">
          {(['ios', 'android', 'windows'] as const).map((item) => (
            <Button key={item} type="button" size="sm" variant={device === item ? 'default' : 'outline'}
              aria-pressed={device === item} onClick={() => { setDevice(item); setStep(0); }}>
              {guides[item].name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Tutorial para {guide.name} · {guide.browser}</p>
        {device !== 'windows' ? (
          <video key={device} src={videosDeInstalacao[device].src} poster={videosDeInstalacao[device].capa} controls playsInline preload="none"
            className="mx-auto aspect-[9/16] max-h-[55svh] rounded-xl border border-border bg-black" />
        ) : null}
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Passo {step + 1} de {passos.length}</p>
          <div className="mt-3 flex min-h-40 items-center justify-center rounded-xl border border-border bg-background p-4" role="img" aria-label={`Ilustração: ${current.visual}`}>
            <div className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-1 border-b border-border bg-muted px-3 py-2"><span className="h-2 w-2 rounded-full bg-primary/50" /><span className="h-2 w-2 rounded-full bg-primary/30" /><span className="h-2 w-2 rounded-full bg-primary/20" /></div>
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-3 py-4 text-center">
                <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
                <span className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground">{current.visual}</span>
              </div>
            </div>
          </div>
          <h3 className="mt-4 text-base font-semibold">{current.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{current.detail}</p>
          {noApp && step === 0 && device !== 'windows' ? (
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void copiarLink()}>
              <Copy className="mr-1 h-4 w-4" />{copiado ? 'Link copiado!' : 'Copiar link nosigilo.net'}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-1.5" aria-label={`Passo ${step + 1} de ${passos.length}`}>
          {passos.map((_, index) => <span key={index} className={`h-2 rounded-full ${index === step ? 'w-5 bg-primary' : 'w-2 bg-muted-foreground/30'}`} />)}
        </div>
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Voltar</Button>
          {step < passos.length - 1 ? (
            <Button type="button" onClick={() => setStep((value) => value + 1)}>Próximo<ChevronRight className="ml-1 h-4 w-4" /></Button>
          ) : onInstall && device !== 'ios' ? (
            <Button type="button" onClick={() => void onInstall()}><Download className="mr-1 h-4 w-4" />Instalar agora</Button>
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)}>Entendi</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
