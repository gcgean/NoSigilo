import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectarCelular, emNavegadorDeApp, guiasDeInstalacao, videosDeInstalacao, type Celular } from '@/components/PwaInstallTutorial';

// Página pública com o vídeo de como instalar. É o link que a Lola manda no chat
// de suporte, então precisa abrir sem login e direto no aparelho da pessoa.
export default function Instalar() {
  const [celular, setCelular] = useState<Celular>(detectarCelular);
  const [noApp] = useState(emNavegadorDeApp);
  const [copiado, setCopiado] = useState(false);
  const guia = guiasDeInstalacao[celular];
  const video = videosDeInstalacao[celular];
  const navegador = celular === 'ios' ? 'Safari' : 'Chrome';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText('https://nosigilo.net');
      setCopiado(true);
    } catch { /* sem permissão: a pessoa digita o endereço */ }
  };

  return (
    <main className="min-h-svh bg-[#0d0a10] px-4 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <img src="/icon-192.png" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-2xl" />
        <h1 className="mt-4 text-3xl font-extrabold leading-tight">Instale o NoSigilo no celular</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Não está na Play Store nem na App Store: a instalação é feita pelo navegador, em menos de um minuto.
        </p>

        <div className="mt-5 grid w-full grid-cols-2 gap-2" aria-label="Escolha seu celular">
          {(['ios', 'android'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={celular === item} onClick={() => setCelular(item)}
              className={`min-h-11 rounded-xl border text-sm font-bold transition-colors ${celular === item ? 'border-pink-500 bg-pink-600 text-white' : 'border-white/20 bg-white/5 text-white/80'}`}>
              {item === 'ios' ? 'iPhone' : 'Android'}
            </button>
          ))}
        </div>

        {noApp ? (
          <div className="mt-4 w-full rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-left text-sm leading-relaxed">
            <p className="flex items-center gap-1.5 font-bold"><ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />Abra no {navegador} para instalar</p>
            <p className="mt-1 text-white/80">O navegador do Instagram não instala apps. Assista ao vídeo aqui e depois abra nosigilo.net no {navegador}.</p>
            <Button type="button" size="sm" variant="outline" className="mt-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => void copiar()}>
              <Copy className="mr-1 h-4 w-4" />{copiado ? 'Link copiado!' : 'Copiar link nosigilo.net'}
            </Button>
          </div>
        ) : null}

        <video key={celular} src={video.src} poster={video.capa} controls playsInline preload="metadata"
          className="mt-5 aspect-[9/16] w-full max-w-xs rounded-2xl border border-white/10 bg-black" />
        <p className="mt-2 text-xs text-white/60">Tem legenda: dá para assistir sem som.</p>

        <h2 className="mt-7 w-full text-left text-lg font-bold">Passo a passo no {guia.name}</h2>
        <ol className="mt-3 w-full space-y-3 text-left">
          {guia.steps.map((passo, indice) => (
            <li key={passo.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-600 text-sm font-bold">{indice + 1}</span>
              <div>
                <p className="text-sm font-bold">{passo.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/70">{passo.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <Button asChild className="mt-6 min-h-11 w-full bg-pink-600 font-bold text-white hover:bg-pink-700">
          <Link to="/">Ir para o NoSigilo</Link>
        </Button>
      </div>
    </main>
  );
}
