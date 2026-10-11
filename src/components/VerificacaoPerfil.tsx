import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { profileService, verificacaoService, type SituacaoVerificacao } from '@/services/api';

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/**
 * Verificação de perfil de mulher: código + selfie segurando o código escrito
 * à mão. A equipe compara com as fotos do perfil e aprova (selo + acesso grátis
 * para sempre) ou recusa com motivo.
 */
export default function VerificacaoPerfil({ onMudou }: { onMudou?: () => void }) {
  const { toast } = useToast();
  const [sit, setSit] = useState<SituacaoVerificacao | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ file: File; preview: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = () => verificacaoService.situacao().then((s) => {
    setSit(s);
    if (s.pedido?.status === 'aguardando_foto') setCodigo(s.pedido.codigo);
  }).catch(() => setSit(null));
  useEffect(() => { void carregar(); }, []);
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.preview); }, [foto]);

  const comecar = async () => {
    setOcupado(true);
    try {
      setCodigo((await verificacaoService.gerarCodigo()).codigo);
    } catch (e: any) {
      toast({ title: 'Não foi possível começar', description: e?.response?.data?.message || 'Tente de novo.', variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async () => {
    if (!foto) return;
    setOcupado(true);
    try {
      const { id } = await profileService.uploadMedia(foto.file, { source: 'chat' });
      await verificacaoService.enviar(id);
      toast({ title: 'Foto enviada ✅', description: 'A equipe vai analisar e você recebe a resposta nas notificações.' });
      setFoto(null);
      setCodigo(null);
      await carregar();
      onMudou?.();
    } catch (e: any) {
      toast({ title: 'Não foi possível enviar', description: e?.response?.data?.message || 'Tente de novo.', variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  if (!sit) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!sit.podeVerificar) return null;

  const mulher = !!sit.acessoVitalicio;
  const casal = String(sit.genero || '').toLowerCase().startsWith('casal');

  if (sit.verificada) {
    return (
      <div className="rounded-2xl border border-sky-400/40 bg-sky-500/10 p-4 text-center">
        <BadgeCheck className="mx-auto mb-1 h-8 w-8 fill-sky-500 text-white" />
        <p className="font-semibold">Perfil verificado</p>
        <p className="text-sm text-muted-foreground">
          {mulher ? 'Você tem o selo de verificada e acesso grátis para sempre. 💖' : 'Seu perfil tem o selo de verificado: todo mundo vê que ele é real.'}
        </p>
      </div>
    );
  }

  if (sit.pedido?.status === 'em_analise') {
    return (
      <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-center">
        <Clock className="mx-auto mb-1 h-7 w-7 text-amber-500" />
        <p className="font-semibold">Verificação em análise</p>
        <p className="text-sm text-muted-foreground">Recebemos sua foto. Você recebe a resposta nas notificações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-pink-400/40 bg-gradient-to-br from-pink-500/15 via-background to-fuchsia-500/10 p-4">
      <div>
        <p className="flex items-center gap-2 font-bold">
          <BadgeCheck className="h-5 w-5 fill-sky-500 text-white" />
          {mulher ? 'Verifique seu perfil e ganhe acesso grátis para sempre' : 'Verifique seu perfil e ganhe o selo de verificado'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {mulher ? (
            <>
              Mulher verificada usa o NoSigilo de graça, sem prazo, e ganha o selo de <strong className="text-foreground">Verificada</strong> no perfil.
              {sit.acessoAte && !sit.acessoAte.startsWith('2099') && <> Seu acesso grátis atual vai até <strong className="text-foreground">{dataCurta(sit.acessoAte)}</strong>.</>}
            </>
          ) : (
            <>
              O selo <strong className="text-foreground">{casal ? 'Verificados' : 'Verificado'}</strong> aparece em destaque no seu perfil e mostra para todo mundo que
              {casal ? ' vocês são reais' : ' você é real'}. Perfil verificado recebe mais respostas.
            </>
          )}
        </p>
        {sit.pedido?.status === 'recusada' && (
          <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
            Sua última foto não foi aprovada{sit.pedido.motivo ? `: ${sit.pedido.motivo}` : '.'} Pode tentar de novo.
          </p>
        )}
      </div>

      {!codigo ? (
        <Button className="w-full bg-gradient-primary" disabled={ocupado} onClick={() => void comecar()}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : sit.pedido?.status === 'recusada' ? 'Tentar de novo' : 'Quero verificar meu perfil'}
        </Button>
      ) : (
        <>
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <p className="text-xs text-muted-foreground">Escreva este código num papel</p>
            <p className="font-mono text-4xl font-extrabold tracking-[0.3em] text-primary">{codigo}</p>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Escreva o código à mão num papel.</li>
            <li>{casal ? 'Tirem uma selfie segurando o papel, de preferência os dois aparecendo.' : 'Tire uma selfie segurando o papel, com o rosto aparecendo.'}</li>
            <li>Envie aqui. Só a equipe vê essa foto: ela não aparece no perfil.</li>
          </ol>
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFoto({ file: f, preview: URL.createObjectURL(f) });
              e.target.value = '';
            }}
          />
          {foto ? (
            <div className="space-y-2">
              <img src={foto.preview} alt="Sua selfie" className="mx-auto max-h-64 rounded-xl object-contain" />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={ocupado} onClick={() => arquivo.current?.click()} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Trocar foto</Button>
                <Button className="bg-gradient-primary" disabled={ocupado} onClick={() => void enviar()}>
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar para análise'}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full gap-2 bg-gradient-primary" onClick={() => arquivo.current?.click()}>
              <Camera className="h-4 w-4" /> Tirar a selfie com o código
            </Button>
          )}
        </>
      )}
    </div>
  );
}
