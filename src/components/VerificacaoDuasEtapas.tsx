import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { twoFactorService } from '@/services/api';
import { getApiErrorInfo } from '@/utils/apiError';
import { esquecerTokenDoAparelho, guardarTokenDoAparelho, lerTokenDoAparelho } from '@/lib/aparelhoConfiavel';

type Estado = Awaited<ReturnType<typeof twoFactorService.status>>;

function dataCurta(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Configurações › Segurança: ligar/desligar a verificação e cuidar dos aparelhos. */
export default function VerificacaoDuasEtapas({ email }: { email: string }) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  // Ligando: aguardando o código do e-mail.
  const [ativacao, setAtivacao] = useState<{ challengeId: string; emailMasked: string; previewCode?: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  // Desligando: pede a senha.
  const [desligando, setDesligando] = useState(false);
  const [senha, setSenha] = useState('');

  const carregar = useCallback(async () => {
    try {
      setEstado(await twoFactorService.status(lerTokenDoAparelho(email)));
    } catch {
      setEstado(null);
    } finally {
      setCarregando(false);
    }
  }, [email]);

  useEffect(() => { void carregar(); }, [carregar]);

  const falhou = (erro: unknown, titulo: string) => {
    const info = getApiErrorInfo(erro, { title: titulo, description: 'Tente de novo em instantes.' });
    toast({ title: info.title, description: info.description, variant: 'destructive' });
  };

  const comecarAtivacao = async () => {
    setOcupado(true);
    try {
      setAtivacao(await twoFactorService.enableStart());
      setCodigo('');
    } catch (e) {
      falhou(e, 'Não foi possível enviar o código');
    } finally {
      setOcupado(false);
    }
  };

  const confirmarAtivacao = async () => {
    if (!ativacao) return;
    setOcupado(true);
    try {
      const r = await twoFactorService.enableConfirm(ativacao.challengeId, codigo.trim());
      // O aparelho que ligou já fica de confiança.
      guardarTokenDoAparelho(email, r.deviceToken);
      setAtivacao(null);
      toast({ title: 'Verificação em duas etapas ligada', description: 'Aparelhos novos vão pedir um código enviado ao seu e-mail.' });
      await carregar();
    } catch (e) {
      falhou(e, 'Código não aceito');
      setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  const desligar = async () => {
    setOcupado(true);
    try {
      await twoFactorService.disable(senha);
      esquecerTokenDoAparelho(email);
      setDesligando(false);
      setSenha('');
      toast({ title: 'Verificação em duas etapas desligada' });
      await carregar();
    } catch (e) {
      falhou(e, 'Não foi possível desligar');
    } finally {
      setOcupado(false);
    }
  };

  const tirarConfianca = async (id: string, atual: boolean) => {
    setOcupado(true);
    try {
      await twoFactorService.revokeDevice(id);
      if (atual) esquecerTokenDoAparelho(email);
      await carregar();
    } catch (e) {
      falhou(e, 'Não foi possível remover');
    } finally {
      setOcupado(false);
    }
  };

  const tirarTodos = async () => {
    setOcupado(true);
    try {
      await twoFactorService.revokeAll();
      esquecerTokenDoAparelho(email);
      toast({ title: 'Nenhum aparelho é mais de confiança', description: 'O próximo acesso em qualquer aparelho vai pedir o código.' });
      await carregar();
    } catch (e) {
      falhou(e, 'Não foi possível remover');
    } finally {
      setOcupado(false);
    }
  };

  if (carregando) {
    return (
      <div className="glass flex justify-center rounded-xl p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
    );
  }
  if (!estado) return null;

  return (
    <div className="glass space-y-4 rounded-xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Verificação em duas etapas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ao entrar com senha num aparelho novo, pedimos também um código enviado ao seu e-mail. Mesmo que alguém descubra sua senha, não entra sem o código.
          </p>
        </div>
        {estado.hasPassword && (
          <Switch
            checked={estado.enabled || !!ativacao}
            disabled={ocupado}
            onCheckedChange={(ligar) => {
              if (ligar && !estado.enabled) void comecarAtivacao();
              if (!ligar && estado.enabled) setDesligando(true);
              if (!ligar && ativacao) setAtivacao(null);
            }}
            aria-label="Verificação em duas etapas"
          />
        )}
      </div>

      {!estado.hasPassword && (
        <p className="rounded-lg border bg-secondary/30 p-3 text-sm text-muted-foreground">
          Você entra pelo Google, que já tem a própria verificação em duas etapas. Ela protege sua conta aqui também.
        </p>
      )}

      {ativacao && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm">Enviamos um código de 6 números para <strong>{ativacao.emailMasked}</strong>. Digite para confirmar que este e-mail é seu:</p>
          {ativacao.previewCode && <p className="text-xs text-muted-foreground">Código (ambiente de teste): {ativacao.previewCode}</p>}
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="max-w-[10rem] text-center tracking-[0.3em]"
            />
            <Button onClick={() => void confirmarAtivacao()} disabled={ocupado || codigo.length !== 6}>Ligar</Button>
          </div>
        </div>
      )}

      {desligando && (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm">Para desligar, confirme sua senha. Os aparelhos de confiança também serão esquecidos.</p>
          <div className="flex flex-wrap gap-2">
            <Input type="password" placeholder="Sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="max-w-xs" />
            <Button variant="destructive" onClick={() => void desligar()} disabled={ocupado || !senha}>Desligar</Button>
            <Button variant="ghost" onClick={() => { setDesligando(false); setSenha(''); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {estado.enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Aparelhos de confiança</p>
            {estado.devices.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void tirarTodos()} disabled={ocupado}>Esquecer todos</Button>
            )}
          </div>
          {estado.devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum. O próximo acesso em qualquer aparelho vai pedir o código.</p>
          ) : (
            <ul className="space-y-2">
              {estado.devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {d.label}
                        {d.current && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">este aparelho</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">Último acesso: {dataCurta(d.lastUsedAt || d.createdAt)}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void tirarConfianca(d.id, d.current)} disabled={ocupado} aria-label="Esquecer este aparelho">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Perdeu um aparelho? Esqueça ele aqui e troque sua senha. Perdeu o acesso ao e-mail? Fale com o suporte.
          </p>
        </div>
      )}
    </div>
  );
}
