import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
  Gift,
  Link2,
  Repeat2,
  Share2,
  Shield,
  Smartphone,
  Star,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRICE = 9.90;
const RATE = 0.20;
const PER_REFERRAL = PRICE * RATE; // R$1.98

const STEPS = [
  {
    icon: BadgeDollarSign,
    color: 'bg-emerald-500/15 text-emerald-500',
    title: 'Ative seu perfil de promotor',
    desc: 'Cadastre seu nome completo e sua chave Pix. É rápido e totalmente gratuito.',
  },
  {
    icon: Link2,
    color: 'bg-blue-500/15 text-blue-500',
    title: 'Gere seu link exclusivo',
    desc: 'Você recebe um link de convite personalizado para compartilhar onde quiser.',
  },
  {
    icon: Share2,
    color: 'bg-purple-500/15 text-purple-500',
    title: 'Divulgue para quem você conhece',
    desc: 'WhatsApp, Instagram, Telegram, TikTok — qualquer canal que você já usa.',
  },
  {
    icon: Wallet,
    color: 'bg-yellow-500/15 text-yellow-500',
    title: 'Receba 20% via Pix todo mês',
    desc: 'Cada assinatura confirmada pelo seu convite gera R$1,98 de comissão para você.',
  },
];

const BENEFITS = [
  { icon: Repeat2,    text: 'Comissão recorrente enquanto o assinante mantiver o plano' },
  { icon: Shield,     text: 'Sem taxa de adesão, sem mensalidade — 100% gratuito participar' },
  { icon: Smartphone, text: 'Gerencie tudo pelo celular, pelo painel do promotor' },
  { icon: Zap,        text: 'Pagamento automático via Pix todo mês' },
  { icon: Users,      text: 'Sem limite de indicações — quanto mais você divulga, mais ganha' },
  { icon: Star,       text: 'Ganhe badges exclusivos conforme sobe de nível' },
];

const FAQS = [
  {
    q: 'Preciso pagar alguma coisa para participar?',
    a: 'Não. A participação no Programa de Indicação é totalmente gratuita para todos os usuários da plataforma.',
  },
  {
    q: 'Como recebo o pagamento?',
    a: 'Via Pix, mensalmente. Você cadastra a sua chave Pix ao ativar o perfil de promotor e recebemos o pagamento até o dia 10 do mês seguinte ao gerado.',
  },
  {
    q: 'Quando a comissão é confirmada?',
    a: 'A comissão é gerada apenas após a confirmação do pagamento da assinatura. Cancelamentos, estornos ou pagamentos recusados não geram comissão.',
  },
  {
    q: 'Existe comissão sobre indicações de outras pessoas que eu indicar?',
    a: 'Não. A comissão existe apenas sobre as assinaturas diretas de quem entrar pelo seu convite. Não há múltiplos níveis.',
  },
  {
    q: 'Quantas pessoas posso indicar?',
    a: 'Não há limite. Você pode criar vários links de convite e compartilhar em quantos canais quiser.',
  },
  {
    q: 'A plataforma é segura e discreta?',
    a: 'Sim. Somos uma plataforma adulta para maiores de 18 anos. Toda a comunicação é privada e segura.',
  },
];

function EarningsCalculator() {
  const [count, setCount] = useState(10);
  const monthly = count * PER_REFERRAL;
  const yearly = monthly * 12;

  return (
    <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-emerald-500" />
        <h3 className="font-bold text-lg">Simule seus ganhos</h3>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Assinantes ativos por mês</span>
          <span className="font-bold text-lg text-foreground">{count}</span>
        </div>
        <input
          type="range"
          min={1}
          max={200}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1</span><span>50</span><span>100</span><span>200</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-background border p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Por mês</p>
          <p className="text-2xl font-bold text-emerald-500">
            {monthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        <div className="rounded-xl bg-background border p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Por ano</p>
          <p className="text-2xl font-bold text-emerald-500">
            {yearly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Baseado em R$ {PER_REFERRAL.toFixed(2).replace('.', ',')} de comissão por assinatura de R$ {PRICE.toFixed(2).replace('.', ',')}
      </p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-xl border bg-card p-4 space-y-2 hover:bg-secondary/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{q}</p>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </div>
      {open && <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>}
    </button>
  );
}

export default function PromoterLanding() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto w-full space-y-10 pb-16">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-6 py-12 sm:px-10 sm:py-16 text-white text-center space-y-5">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm">
            <BadgeDollarSign className="w-4 h-4 text-yellow-300" />
            Programa de Indicação — NoSigilo
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            Ganhe renda extra<br />
            <span className="text-yellow-300">divulgando a rede</span>
          </h1>

          <p className="text-white/85 text-base sm:text-lg max-w-xl mx-auto">
            Compartilhe seu link exclusivo. Cada pessoa que assinar a plataforma pelo seu convite
            gera <strong className="text-yellow-300">R$ 1,98 de comissão</strong> direto no seu Pix — todo mês.
          </p>

          {/* Big stat */}
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto pt-2">
            {[
              { value: '20%', label: 'de comissão' },
              { value: 'R$0', label: 'para participar' },
              { value: 'Pix', label: 'todo mês' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/15 backdrop-blur-sm p-3 text-center">
                <p className="text-2xl font-extrabold text-yellow-300">{s.value}</p>
                <p className="text-[11px] text-white/80">{s.label}</p>
              </div>
            ))}
          </div>

          <Button
            size="lg"
            onClick={() => navigate('/promoter')}
            className="bg-yellow-400 text-yellow-900 hover:bg-yellow-300 font-bold text-base gap-2 px-8 shadow-lg"
          >
            Quero ser promotor
            <ArrowRight className="w-5 h-5" />
          </Button>

          <p className="text-white/60 text-xs">Gratuito · Sem mensalidade · Cadastro em 1 minuto</p>
        </div>

        {/* Decorative circles */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
      </div>

      {/* ── Como funciona ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Como funciona</h2>
          <p className="text-muted-foreground text-sm">4 passos simples para começar a ganhar</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {STEPS.map((step, i) => (
            <div key={i} className="glass rounded-2xl p-5 flex gap-4 items-start">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${step.color}`}>
                <step.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-muted-foreground">PASSO {i + 1}</span>
                </div>
                <p className="font-semibold text-sm mb-0.5">{step.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Calculadora ───────────────────────────────────────────────────── */}
      <EarningsCalculator />

      {/* ── Benefícios ────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Por que vale a pena?</h2>
          <p className="text-muted-foreground text-sm">Tudo o que você precisa saber antes de começar</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {BENEFITS.map((b, i) => (
            <div key={i} className="flex items-start gap-3 glass rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <b.icon className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cenário real ──────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Quanto você pode ganhar?</h2>
          <p className="text-muted-foreground text-sm">Exemplos reais baseados no valor atual da assinatura</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Divulgação básica', subs: 5,   emoji: '🌱', desc: 'Você compartilha para amigos próximos' },
            { label: 'Divulgação ativa',  subs: 20,  emoji: '🚀', desc: 'Você usa redes sociais e grupos' },
            { label: 'Divulgação intensa', subs: 50, emoji: '💎', desc: 'Você cria conteúdo e tem audiência' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card p-5 text-center space-y-3">
              <p className="text-3xl">{s.emoji}</p>
              <p className="font-semibold text-sm">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
              <div className="rounded-xl bg-emerald-500/10 py-3">
                <p className="text-xs text-emerald-600 mb-0.5">{s.subs} assinantes</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {(s.subs * PER_REFERRAL).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-xs text-emerald-600">por mês</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          * Valores estimados. Os ganhos reais dependem das assinaturas confirmadas pelos seus indicados.
        </p>
      </div>

      {/* ── Onde divulgar ─────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-center">Onde você pode divulgar</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { emoji: '💬', label: 'WhatsApp', desc: 'Grupos e contatos pessoais' },
            { emoji: '📸', label: 'Instagram', desc: 'Stories, posts e Reels' },
            { emoji: '✈️', label: 'Telegram', desc: 'Grupos e canais' },
            { emoji: '🎵', label: 'TikTok', desc: 'Vídeos curtos' },
            { emoji: '🐦', label: 'X / Twitter', desc: 'Posts e threads' },
            { emoji: '🌐', label: 'Qualquer canal', desc: 'Blogs, fóruns, onde quiser' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-3 text-center space-y-1">
              <p className="text-2xl">{c.emoji}</p>
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
        </div>
        <div className="space-y-2">
          {FAQS.map((faq, i) => <FaqItem key={i} {...faq} />)}
        </div>
      </div>

      {/* ── CTA Final ─────────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-8 sm:p-12 text-center text-white space-y-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold">Pronto para começar?</h2>
        <p className="text-white/80 text-sm sm:text-base max-w-md mx-auto">
          Ative seu perfil de promotor agora, gere seu link e comece a ganhar dinheiro divulgando a plataforma que você já usa.
        </p>
        <Button
          size="lg"
          onClick={() => navigate('/promoter')}
          className="bg-yellow-400 text-yellow-900 hover:bg-yellow-300 font-bold text-base gap-2 px-10 shadow-lg"
        >
          <BadgeDollarSign className="w-5 h-5" />
          Quero ser promotor agora
        </Button>
        <p className="text-white/50 text-xs">
          Gratuito · Pagamento via Pix · Sem compromisso
        </p>
      </div>
    </div>
  );
}
