import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, BadgeAlert, HeartHandshake, EyeOff, Users, Ban } from 'lucide-react';

const sections = [
  {
    icon: Shield,
    title: 'Ambiente adulto e legal',
    items: [
      'O NoSigilo é destinado exclusivamente a maiores de 18 anos.',
      'É proibido publicar, solicitar, armazenar ou compartilhar qualquer conteúdo envolvendo menores de idade.',
      'O usuário deve cumprir a legislação aplicável sobre privacidade, imagem, consentimento e crimes digitais.',
    ],
  },
  {
    icon: HeartHandshake,
    title: 'Consentimento em primeiro lugar',
    items: [
      'Toda interação deve ser consensual, clara e respeitosa.',
      'Não pressione, coagida, ameace ou manipule outros usuários para obter fotos, encontros ou conversas íntimas.',
      '“Não”, silêncio, bloqueio ou recusa encerram a tentativa de contato.',
    ],
  },
  {
    icon: EyeOff,
    title: 'Discrição e privacidade',
    items: [
      'Não exponha conversas, fotos privadas ou dados pessoais de terceiros sem autorização explícita.',
      'Use os controles de fotos privadas com responsabilidade e revogue acessos quando necessário.',
      'Perfis falsos, coleta indevida de dados e tentativa de identificar usuários sem consentimento podem gerar banimento.',
    ],
  },
  {
    icon: Users,
    title: 'Público e convivência',
    items: [
      'A plataforma é voltada principalmente para casais e singles femininos e masculinos em busca de conexões adultas consensuais.',
      'Respeite a diversidade de perfis, orientações, limites e preferências.',
      'Assédio, discriminação, humilhação, perseguição e linguagem abusiva não são permitidos.',
    ],
  },
  {
    icon: Ban,
    title: 'Condutas proibidas',
    items: [
      'Golpes, spam, venda ilegal, chantagem, extorsão ou tentativa de fraude.',
      'Compartilhamento de conteúdo sem consentimento, inclusive “revenge porn”.',
      'Uso da plataforma para atividades ilegais, violência, exploração ou ameaça.',
    ],
  },
  {
    icon: BadgeAlert,
    title: 'Moderação e medidas',
    items: [
      'Podemos remover conteúdo, restringir recursos, suspender ou encerrar contas que violem estas diretrizes.',
      'Casos graves podem ser preservados para cooperação com autoridades competentes.',
      'Ao permanecer na plataforma, você concorda em agir com responsabilidade, discrição e respeito.',
    ],
  },
];

export default function Guidelines() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container max-w-4xl mx-auto px-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Diretrizes da Comunidade</h1>
            <p className="text-muted-foreground">Segurança, discrição, respeito e consentimento para um ambiente adulto responsável.</p>
          </div>
        </div>

        <div className="grid gap-6">
          {sections.map((section) => (
            <section key={section.title} className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-primary/12 flex items-center justify-center">
                  <section.icon className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">{section.title}</h2>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
