import { useRef, useState } from 'react';
import { Camera, Check, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CitySearch } from '@/components/CitySearch';
import { useAuth } from '@/contexts/AuthContext';
import { feedService, marcarPassoCadastro, profileService } from '@/services/api';
import { concluirPrimeirosPassos, primeirosPassosAtivos } from '@/utils/primeiroAcesso';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

/**
 * Tela única depois do cadastro, em três abas: cidade, quem a pessoa curte e foto.
 * É o que o app precisa para mostrar gente certa. Cidade e "quem curte" são
 * obrigatórios; a foto pode ficar para depois. O resto é pedido em outro dia.
 */
const PERFIS = [
  { value: 'Casal (Ele/Ela)', label: 'Casal Ele/Ela', emoji: '👫' },
  { value: 'Mulher', label: 'Mulher', emoji: '👩' },
  { value: 'Homem', label: 'Homem', emoji: '👨' },
  { value: 'Casal (Ela/Ela)', label: 'Casal Ela/Ela', emoji: '👭' },
  { value: 'Casal (Ele/Ele)', label: 'Casal Ele/Ele', emoji: '👬' },
  { value: 'Transexual', label: 'Pessoa trans', emoji: '🏳️‍⚧️' },
  { value: 'Travesti', label: 'Travesti', emoji: '🌟' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser', emoji: '✨' },
];
const ABAS = ['Cidade', 'Quem curte', 'Foto'];
const cidadeValida = (valor?: string | null) => String(valor ?? '').trim().length >= 3;

export default function PrimeirosPassos() {
  const { user, updateUser } = useAuth();
  const [, atualizar] = useState(0);
  const [passo, setPasso] = useState(() => (cidadeValida(user?.city) ? 1 : 0));
  const [cidade, setCidade] = useState(cidadeValida(user?.city) ? String(user?.city) : '');
  const [estado, setEstado] = useState(user?.state ?? '');
  const [curte, setCurte] = useState<string[]>(user?.lookingFor ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const marcouAbertura = useRef(false);

  if (!user?.id || !primeirosPassosAtivos(user.id)) return null;
  if (!marcouAbertura.current) {
    marcouAbertura.current = true;
    marcarPassoCadastro('pp_abriu');
  }

  const concluir = (evento: string) => {
    marcarPassoCadastro(evento);
    concluirPrimeirosPassos(user.id);
    atualizar((n) => n + 1);
  };

  const salvarCidade = async () => {
    if (!cidadeValida(cidade)) { setErro('Digite sua cidade ou escolha na lista.'); return; }
    setSalvando(true);
    setErro('');
    try {
      const dados = { city: cidade.trim(), state: estado.trim() || undefined };
      await profileService.updateProfile(dados);
      updateUser(dados);
      marcarPassoCadastro('pp_cidade');
      setPasso(1);
    } catch (e: any) {
      // Cidade que não existe (bairro, endereço): o servidor explica o que fazer.
      setErro(e?.response?.data?.message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarCurte = async () => {
    if (curte.length === 0) { setErro('Escolha pelo menos uma opção.'); return; }
    setSalvando(true);
    setErro('');
    try {
      await profileService.updateProfile({ lookingFor: curte });
      updateUser({ lookingFor: curte });
      marcarPassoCadastro('pp_curte');
      setPasso(2);
    } catch {
      setErro('Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const enviarFoto = async (arquivo?: File) => {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { setErro('Escolha uma imagem.'); return; }
    setSalvando(true);
    setErro('');
    try {
      const enviada = await profileService.uploadMedia(arquivo, { isPrivate: false, source: 'profile' });
      const id = enviada?.id ? String(enviada.id) : '';
      if (!id) throw new Error('sem id');
      await feedService.createPost({ content: '', mediaIds: [id] }).catch(() => {});
      await profileService.setMainPhoto(id);
      const url = enviada?.url ? String(enviada.url) : '';
      if (url) { updateUser({ avatar: url }); setFoto(url); }
      marcarPassoCadastro('pp_foto');
    } catch (e) {
      setErro((e as any)?.response?.data?.message || 'Não foi possível enviar a foto. Tente outra.');
    } finally {
      setSalvando(false);
      if (seletor.current) seletor.current.value = '';
    }
  };

  const alternar = (valor: string) => {
    setErro('');
    setCurte((l) => (l.includes(valor) ? l.filter((x) => x !== valor) : [...l, valor]));
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Primeiros passos"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col p-5">
        <h1 className="text-center text-xl font-bold">Sua conta está criada 🎉</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Falta pouco para mostrar gente certa para você.</p>

        <div className="mt-5 grid grid-cols-3 gap-2" role="tablist">
          {ABAS.map((aba, i) => (
            <button
              key={aba}
              type="button"
              role="tab"
              aria-selected={passo === i}
              disabled={i > passo}
              onClick={() => { setErro(''); setPasso(i); }}
              className={cn('flex min-h-11 items-center justify-center gap-1 rounded-xl border text-xs font-semibold',
                passo === i ? 'border-primary bg-primary/15 text-foreground' : i < passo ? 'border-primary/40 text-foreground' : 'border-border text-muted-foreground')}
            >
              {i < passo ? <Check className="h-3.5 w-3.5 text-primary" /> : <span>{i + 1}.</span>} {aba}
            </button>
          ))}
        </div>

        <div className="mt-6 flex-1 space-y-4">
          {passo === 0 && (
            <>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Qual é a sua cidade?</h2>
              </div>
              <p className="text-sm text-muted-foreground">É ela que mostra quem está perto e faz você aparecer para essas pessoas. Endereço, nunca.</p>
              <CitySearch
                value={cidade}
                onChange={(v) => { setErro(''); setCidade(v); }}
                onSelect={(c, s) => { setErro(''); setCidade(c); setEstado(s); }}
                placeholder="Digite sua cidade..."
              />
            </>
          )}

          {passo === 1 && (
            <>
              <h2 className="text-lg font-semibold">Quem você curte?</h2>
              <p className="text-sm text-muted-foreground">Escolha um ou mais. Dá para mudar quando quiser.</p>
              <div className="grid grid-cols-2 gap-2">
                {PERFIS.map((p) => {
                  const marcado = curte.includes(p.value);
                  return (
                    <button key={p.value} type="button" aria-pressed={marcado} onClick={() => alternar(p.value)}
                      className={cn('flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium',
                        marcado ? 'border-primary bg-primary/10' : 'border-border')}>
                      <span aria-hidden="true">{p.emoji}</span>
                      <span className="min-w-0 flex-1 truncate">{p.label}</span>
                      {marcado && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {passo === 2 && (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Coloque sua foto de perfil</h2>
              <p className="text-sm text-muted-foreground">Sem foto, você não aparece no Match e na Busca.</p>
              <div className="mx-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-primary/40 bg-secondary/30">
                {foto ? <img src={resolveServerUrl(foto)} alt="Sua foto" className="h-full w-full object-cover" /> : <Camera className="h-10 w-10 text-primary" />}
              </div>
              <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => void enviarFoto(e.target.files?.[0])} />
            </div>
          )}
          {erro && <p role="alert" className="text-center text-sm font-medium text-destructive">{erro}</p>}
        </div>

        <div className="sticky bottom-0 mt-5 space-y-2 bg-background pb-2 pt-2">
          {passo === 0 && <Button className="h-12 w-full text-base" disabled={salvando} onClick={() => void salvarCidade()}>{salvando ? 'Salvando…' : 'Continuar'}</Button>}
          {passo === 1 && <Button className="h-12 w-full text-base" disabled={salvando} onClick={() => void salvarCurte()}>{salvando ? 'Salvando…' : 'Continuar'}</Button>}
          {passo === 2 && (foto ? (
            <Button className="h-12 w-full text-base" onClick={() => concluir('pp_fim')}>Entrar no NoSigilo</Button>
          ) : (
            <>
              <Button className="h-12 w-full text-base" disabled={salvando} onClick={() => seletor.current?.click()}>
                {salvando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</> : 'Escolher foto'}
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" disabled={salvando} onClick={() => concluir('pp_pulou_foto')}>Agora não</Button>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
