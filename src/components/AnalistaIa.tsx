import { useEffect, useRef, useState } from 'react';
import { BarChart3, Loader2, Send, Sparkles, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/api';
import { lerPaineisPublicados } from '@/utils/paineisParaIa';

// ─── Analista IA do admin ────────────────────────────────────────────────────
// Conversa sobre os dashboards abertos. Cada pergunta leva os dados que os
// painéis publicaram (utils/paineisParaIa.ts) no momento do envio.

type Mensagem = { role: 'user' | 'assistant'; content: string; paineis?: string[] };

const NOMES_DAS_ABAS: Record<string, string> = {
  metrics: 'Métricas',
  photos: 'Moderação de fotos',
  users: 'Usuários',
  reports: 'Denúncias',
  finance: 'Finanças',
  states: 'Cidades sem UF',
  visits: 'Visitas',
  logs: 'Logs',
  suggestions: 'Sugestões',
  referrals: 'Indicações',
  reengagement: 'Reengajamento',
  promoters: 'Promotores',
};

const SUGESTOES = [
  'Resuma o que estes números estão dizendo e o que mais chama atenção.',
  'Onde estou perdendo receita e o que fazer primeiro?',
  'Quais cidades e canais trazem cadastros que viram assinantes?',
  'O que devo priorizar esta semana para crescer?',
];

// Negrito (**x**) e listas de hífen, o suficiente para as respostas da IA.
function TextoFormatado({ texto }: { texto: string }) {
  return (
    <div className="space-y-1.5">
      {texto.split('\n').map((linha, i) => {
        const partes = linha.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>
        );
        if (/^\s*[-•*]\s+/.test(linha)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-muted-foreground">•</span>
              <span>{partes.map((p, j) => (j === 0 && typeof p.props.children === 'string'
                ? <span key={j}>{String(p.props.children).replace(/^\s*[-•*]\s+/, '')}</span>
                : p))}</span>
            </div>
          );
        }
        if (/^#{1,4}\s/.test(linha)) {
          return <p key={i} className="pt-1 font-semibold">{linha.replace(/^#{1,4}\s/, '')}</p>;
        }
        return linha.trim() ? <p key={i}>{partes}</p> : <div key={i} className="h-1" />;
      })}
    </div>
  );
}

export default function AnalistaIa({ abaAtiva }: { abaAtiva: string }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paineisVisiveis, setPaineisVisiveis] = useState<string[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);
  const cancelado = useRef(false);

  useEffect(() => {
    if (aberto) setPaineisVisiveis(lerPaineisPublicados().map((p) => p.nome));
  }, [aberto, abaAtiva]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, pensando]);

  useEffect(() => () => { cancelado.current = true; }, []);

  const perguntar = async (texto: string) => {
    const q = texto.trim();
    if (!q || pensando) return;
    const paineis = lerPaineisPublicados();
    const historico = mensagens.map(({ role, content }) => ({ role, content }));
    setMensagens((atual) => [...atual, { role: 'user', content: q, paineis: paineis.map((p) => p.nome) }]);
    setPergunta('');
    setErro(null);
    setPensando(true);
    try {
      const { id } = await adminService.perguntarAnalista({ pergunta: q, abaAtiva: NOMES_DAS_ABAS[abaAtiva] ?? abaAtiva, paineis, historico });
      // Consulta a cada 3s por até 5 minutos (o modelo que raciocina pode demorar).
      for (let volta = 0; volta < 100 && !cancelado.current; volta += 1) {
        await new Promise((ok) => setTimeout(ok, 3000));
        const r = await adminService.resultadoAnalista(id);
        if (r.status === 'pronto' && r.resposta) {
          setMensagens((atual) => [...atual, { role: 'assistant', content: r.resposta! }]);
          return;
        }
        if (r.status === 'erro') {
          setErro(r.message || 'A IA não conseguiu responder agora.');
          return;
        }
      }
      setErro('A análise demorou demais. Tente uma pergunta mais específica.');
    } catch (e: any) {
      setErro(e?.response?.data?.message || 'Não foi possível falar com a IA agora.');
    } finally {
      setPensando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-primary px-4 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 md:bottom-6"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <Sparkles className="h-4 w-4" /> Analista IA
      </button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Analista IA
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Analisa os números dos painéis abertos para ajudar nas decisões. Nomes, e-mails e outros dados pessoais são removidos antes do envio.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              {paineisVisiveis.length === 0 ? (
                <span className="text-muted-foreground">Nenhum painel carregado ainda. Abra uma aba com gráficos.</span>
              ) : (
                paineisVisiveis.map((p) => (
                  <span key={p} className="rounded-full bg-secondary px-2 py-0.5">{p}</span>
                ))
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {mensagens.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Aba aberta: <strong>{NOMES_DAS_ABAS[abaAtiva] ?? abaAtiva}</strong>. Pergunte algo ou comece por uma sugestão:
                </p>
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void perguntar(s)}
                    className="block w-full rounded-xl border bg-card p-3 text-left text-sm hover:bg-secondary/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground'
                  : 'max-w-[95%] rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2.5'}
                >
                  {m.role === 'user' ? (
                    <>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.paineis && m.paineis.length > 0 && (
                        <p className="mt-1 text-[10px] text-primary-foreground/70">com: {m.paineis.join(', ')}</p>
                      )}
                    </>
                  ) : (
                    <TextoFormatado texto={m.content} />
                  )}
                </div>
              </div>
            ))}
            {pensando && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analisando os números… pode levar até 1 minuto.
              </div>
            )}
            {erro && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{erro}</p>}
            <div ref={fimRef} />
          </div>

          <div className="border-t p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-end gap-2">
              <textarea
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Ex.: por que as renovações caíram em setembro?"
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void perguntar(pergunta);
                  }
                }}
                disabled={pensando}
              />
              <Button size="icon" onClick={() => void perguntar(pergunta)} disabled={pensando || !pergunta.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {mensagens.length > 0 && (
              <button
                type="button"
                onClick={() => { setMensagens([]); setErro(null); }}
                disabled={pensando}
                className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" /> Nova conversa
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
