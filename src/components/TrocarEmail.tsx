import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Trocar o e-mail da conta (Configurações › Segurança). Pede a senha atual e
 * confirma com um código enviado ao e-mail NOVO, para não trocar por um
 * endereço digitado errado.
 */
export default function TrocarEmail({ emailAtual }: { emailAtual: string }) {
  const { updateUser } = useAuth();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [desafio, setDesafio] = useState<{ id: string; para: string | null } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    setAberto(false); setNovoEmail(''); setSenha(''); setDesafio(null); setCodigo(''); setErro(null);
  };

  const pedirCodigo = async () => {
    setEnviando(true); setErro(null);
    try {
      const r = await authService.trocarEmail(novoEmail.trim(), senha);
      setDesafio({ id: r.challengeId, para: r.emailMasked });
      if (r.previewCode) setCodigo(r.previewCode);
    } catch (e: any) {
      setErro(e?.response?.data?.message || 'Não foi possível enviar o código agora.');
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!desafio) return;
    setEnviando(true); setErro(null);
    try {
      const r = await authService.confirmarTrocaDeEmail(desafio.id, codigo.trim());
      updateUser({ email: r.email } as any);
      toast({ title: 'E-mail trocado ✅', description: `Agora sua conta usa ${r.email}.` });
      fechar();
    } catch (e: any) {
      setErro(e?.response?.data?.message || 'Código inválido.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="glass space-y-3 rounded-xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-primary" /> E-mail da conta</h3>
          <p className="mt-0.5 break-all text-sm text-muted-foreground">{emailAtual}</p>
        </div>
        {!aberto && (
          <Button variant="outline" size="sm" onClick={() => setAberto(true)}>Trocar e-mail</Button>
        )}
      </div>

      {aberto && !desafio && (
        <div className="space-y-2">
          <Input type="email" inputMode="email" autoComplete="email" placeholder="Novo e-mail" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
          <Input type="password" autoComplete="current-password" placeholder="Sua senha atual" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <p className="text-xs text-muted-foreground">Vamos mandar um código para o e-mail novo, para confirmar que está certo.</p>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void pedirCodigo()} disabled={enviando || !novoEmail.includes('@') || !senha} className="bg-gradient-primary">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar código'}
            </Button>
            <Button variant="ghost" onClick={fechar}>Cancelar</Button>
          </div>
        </div>
      )}

      {aberto && desafio && (
        <div className="space-y-2">
          <p className="text-sm">Digite o código de 6 números que enviamos para <strong>{desafio.para || novoEmail}</strong>. Vale por 10 minutos — confira também o spam.</p>
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} className="max-w-[10rem] text-center text-lg tracking-[0.3em]" />
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void confirmar()} disabled={enviando || codigo.length !== 6} className="bg-gradient-primary">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar troca'}
            </Button>
            <Button variant="ghost" onClick={() => { setDesafio(null); setCodigo(''); setErro(null); }}>Voltar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
