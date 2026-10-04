import { useEffect, useState } from 'react';
import { Copy, Link2, Loader2, Send, Unplug } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { adminTelegramService, type ContatoAvisoTelegram, type TipoAvisoTelegram } from '@/services/api';

/**
 * Admin › Telegram: escolhe quais avisos cada contato da equipe recebe.
 * Contato = admin que conectou o próprio Telegram em Configurações › Notificações.
 */
export default function AdminTelegramAvisos() {
  const { toast } = useToast();
  const [tipos, setTipos] = useState<TipoAvisoTelegram[]>([]);
  const [contatos, setContatos] = useState<ContatoAvisoTelegram[]>([]);
  const [botConfigurado, setBotConfigurado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [conectando, setConectando] = useState<string | null>(null);
  // Link gerado para um colega: fica na tela para copiar e mandar.
  const [linkDoColega, setLinkDoColega] = useState<{ id: string; url: string } | null>(null);
  const { user, updateUser } = useAuth();

  const carregar = () =>
    adminTelegramService.listar()
      .then((r) => { setTipos(r.tipos); setContatos(r.contatos); setBotConfigurado(r.botConfigurado); return r; })
      .catch(() => { toast({ title: 'Não foi possível carregar os avisos', variant: 'destructive' }); return null; })
      .finally(() => setCarregando(false));

  useEffect(() => {
    void carregar();
    // Voltou do Telegram (ou o colega conectou): atualiza quem está conectado.
    const aoVoltar = () => { if (!document.hidden) void carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conectar = async (contato: ContatoAvisoTelegram) => {
    setConectando(contato.id);
    try {
      const { url } = await adminTelegramService.gerarLink(contato.id);
      if (contato.id === user?.id) {
        window.open(url, '_blank');
        toast({ title: 'Abrindo o Telegram…', description: 'Toque em Iniciar no bot e volte para esta aba.' });
      } else {
        setLinkDoColega({ id: contato.id, url });
        try { await navigator.clipboard.writeText(url); toast({ title: 'Link copiado', description: `Mande para ${contato.nome}: ao abrir e tocar em Iniciar, o Telegram dele fica conectado.` }); } catch { /* o link fica visível para copiar */ }
      }
    } catch {
      toast({ title: 'Não foi possível gerar o link', variant: 'destructive' });
    } finally {
      setConectando(null);
    }
  };

  const desconectar = async (contato: ContatoAvisoTelegram) => {
    if (!window.confirm(`Desconectar o Telegram de ${contato.nome || contato.email}? Ele para de receber todos os avisos.`)) return;
    setConectando(contato.id);
    try {
      await adminTelegramService.desconectar(contato.id);
      setContatos((prev) => prev.map((c) => (c.id === contato.id ? { ...c, telegramConectado: false } : c)));
      if (contato.id === user?.id) updateUser({ telegramChatId: null } as any);
      toast({ title: 'Telegram desconectado' });
    } catch {
      toast({ title: 'Não foi possível desconectar', variant: 'destructive' });
    } finally {
      setConectando(null);
    }
  };

  const salvar = async (contato: ContatoAvisoTelegram, avisos: string[]) => {
    const anterior = contato.avisos;
    setContatos((prev) => prev.map((c) => (c.id === contato.id ? { ...c, avisos, personalizado: true } : c)));
    setSalvando(contato.id);
    try {
      await adminTelegramService.salvar(contato.id, avisos);
    } catch {
      setContatos((prev) => prev.map((c) => (c.id === contato.id ? { ...c, avisos: anterior } : c)));
      toast({ title: 'Não foi possível salvar', variant: 'destructive' });
    } finally {
      setSalvando(null);
    }
  };

  const testar = async (contato: ContatoAvisoTelegram) => {
    setTestando(contato.id);
    try {
      await adminTelegramService.testar(contato.id);
      toast({ title: 'Mensagem de teste enviada ✅', description: `Confira o Telegram de ${contato.nome}.` });
    } catch (e: any) {
      toast({ title: 'O teste não chegou', description: e?.response?.data?.message || 'Tente de novo.', variant: 'destructive' });
    } finally {
      setTestando(null);
    }
  };

  if (carregando) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card className="glass p-5">
        <h3 className="flex items-center gap-2 font-semibold"><Send className="h-4 w-4 text-primary" /> Avisos no Telegram</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha quais avisos cada pessoa da equipe recebe. Para virar contato, a pessoa precisa ser admin e conectar o
          próprio Telegram em <strong>Configurações › Notificações</strong>.
        </p>
        {!botConfigurado && (
          <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">O bot do Telegram não está configurado no servidor — nenhum aviso sai.</p>
        )}
      </Card>

      {contatos.map((c) => (
        <Card key={c.id} className="glass p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{c.nome || c.email}</p>
              <p className="truncate text-xs text-muted-foreground">{c.email}</p>
              <p className={c.telegramConectado ? 'mt-1 text-xs font-medium text-emerald-600' : 'mt-1 text-xs font-medium text-amber-600'}>
                {c.telegramConectado ? '● Telegram conectado' : '○ Telegram não conectado — não recebe nada até conectar'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.telegramConectado ? (
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={conectando === c.id} onClick={() => void desconectar(c)}>
                  <Unplug className="h-3.5 w-3.5" /> Desconectar
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5 bg-[#229ED9] text-white hover:bg-[#1a8bc4]" disabled={conectando === c.id} onClick={() => void conectar(c)}>
                  {conectando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  {c.id === user?.id ? 'Conectar meu Telegram' : 'Gerar link de conexão'}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={salvando === c.id} onClick={() => void salvar(c, tipos.map((t) => t.id))}>Todos</Button>
              <Button size="sm" variant="outline" disabled={salvando === c.id} onClick={() => void salvar(c, [])}>Nenhum</Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!c.telegramConectado || testando === c.id} onClick={() => void testar(c)}>
                {testando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Testar
              </Button>
            </div>
          </div>
          {linkDoColega?.id === c.id && !c.telegramConectado && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#229ED9]/40 bg-[#229ED9]/10 p-2">
              <p className="min-w-0 flex-1 break-all font-mono text-[11px]">{linkDoColega.url}</p>
              <Button size="sm" variant="ghost" className="shrink-0 gap-1" onClick={() => { void navigator.clipboard?.writeText(linkDoColega.url).then(() => toast({ title: 'Link copiado' })).catch(() => {}); }}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {tipos.map((t) => {
              const ligado = c.avisos.includes(t.id);
              return (
                <label key={t.id} className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.rotulo}</span>
                    <span className="block text-xs text-muted-foreground">{t.descricao}</span>
                  </span>
                  <Switch
                    checked={ligado}
                    disabled={salvando === c.id}
                    onCheckedChange={(v) => void salvar(c, v ? [...c.avisos, t.id] : c.avisos.filter((x) => x !== t.id))}
                  />
                </label>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
