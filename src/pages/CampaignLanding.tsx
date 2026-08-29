import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Eye,
  Gift,
  Images,
  LockKeyhole,
  MapPin,
  MessageCircle,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import "./CampaignLanding.css";

const trustItems = [
  { label: "Casais e singles", icon: UsersRound },
  { label: "Privacidade em primeiro lugar", icon: LockKeyhole },
  { label: "Entrada gratuita", icon: Gift },
];

const features = [
  {
    title: "Descobrir pessoas",
    description: "Encontre casais e singles com interesses em comum.",
    icon: UsersRound,
  },
  {
    title: "Conversas reservadas",
    description: "Converse com privacidade antes de decidir o próximo passo.",
    icon: MessageCircle,
  },
  {
    title: "Fotos sob seu controle",
    description: "Você escolhe o que mostrar e para quem.",
    icon: Images,
  },
  {
    title: "Encontros e experiências",
    description: "Acompanhe eventos e pessoas disponíveis perto de você.",
    icon: MapPin,
  },
];

const privacyItems = [
  { title: "Perfil no seu tempo", description: "Ative, pause ou ajuste quando quiser.", icon: UserRound },
  { title: "Conteúdo privado", description: "Suas fotos e informações ficam sob seu controle.", icon: LockKeyhole },
  { title: "Consentimento sempre", description: "Respeito e escolha são a base de tudo.", icon: ShieldCheck },
];

const audiences = [
  {
    title: "Casais",
    description: "Para conversar, descobrir afinidades e explorar juntos.",
    icon: UsersRound,
  },
  {
    title: "Mulheres e homens solteiros",
    description: "Para conhecer pessoas abertas às mesmas experiências.",
    icon: UserRound,
  },
  {
    title: "Curiosos com discrição",
    description: "Para observar, conversar e revelar apenas o que quiser.",
    icon: LockKeyhole,
  },
];

const questions = [
  {
    title: "Preciso pagar para entrar?",
    description: "Não. Você pode criar seu perfil gratuitamente.",
    icon: CircleDollarSign,
  },
  {
    title: "Meu perfil fica exposto?",
    description: "Você controla suas informações e o que deseja compartilhar.",
    icon: Eye,
  },
  {
    title: "Posso entrar apenas para conhecer?",
    description: "Sim. Entre no seu tempo e descubra a comunidade antes de decidir qualquer experiência.",
    icon: UsersRound,
  },
];

export default function CampaignLanding() {
  const location = useLocation();
  const homeDestination = { pathname: "/", search: location.search };
  const loginDestination = { pathname: "/login", search: location.search };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Conheça o NoSigilo.net — Comunidade liberal para casais e singles";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="campaign-landing">
      <section className="campaign-hero" aria-labelledby="campaign-title">
        <header className="campaign-header">
          <Link to={homeDestination} aria-label="Ir para a página inicial do NoSigilo.net">
            <BrandLogo
              size="sm"
              className="campaign-brand"
              markClassName="campaign-brand-mark"
              textClassName="campaign-brand-text"
            />
          </Link>

          <Link className="campaign-member-link" to={loginDestination}>
            Já sou membro
          </Link>
        </header>

        <div className="campaign-hero-copy">
          <h1 id="campaign-title">
            Entre por curiosidade. <em>Fique pelas conexões.</em>
          </h1>

          <p className="campaign-intro">
            A comunidade liberal para casais e singles que querem conhecer pessoas, conversar e viver novas
            experiências com discrição, respeito e consentimento.
          </p>

          <Link className="campaign-cta" to={homeDestination}>
            Criar meu perfil grátis
            <ArrowRight aria-hidden="true" />
          </Link>

          <p className="campaign-control-note">
            <ShieldCheck aria-hidden="true" />
            <span>Leva menos de 1 minuto</span>
            <span aria-hidden="true">•</span>
            <span>Você controla o que mostra</span>
          </p>

          <div className="campaign-trust" aria-label="Diferenciais da plataforma">
            {trustItems.map(({ label, icon: Icon }) => (
              <div className="campaign-trust-item" key={label}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <figure className="campaign-hero-media">
          <img
            src="/landing/hero-masquerade-722.webp"
            alt="Casais adultos mascarados conversando em um encontro elegante"
            width={722}
            height={361}
            loading="eager"
          />
        </figure>
      </section>

      <section className="campaign-features campaign-section" aria-labelledby="campaign-features-title">
        <figure className="campaign-feature-media">
          <img src="/landing/gaze-couple-722.webp" alt="Casal adulto mascarado trocando olhares em um ambiente reservado" width={722} height={481} />
        </figure>

        <div className="campaign-features-copy">
          <h2 id="campaign-features-title">O que você <em>encontra aqui</em></h2>
          <p>Mais do que perfis. Um espaço para descobrir afinidades no seu ritmo.</p>

          <div className="campaign-feature-list">
            {features.map(({ title, description, icon: Icon }) => (
              <div className="campaign-feature-item" key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>

          <Link className="campaign-cta campaign-cta--wine" to={homeDestination}>
            Quero conhecer a comunidade
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="campaign-privacy" aria-labelledby="campaign-privacy-title">
        <div className="campaign-section campaign-privacy-inner">
          <div className="campaign-privacy-copy">
            <h2 id="campaign-privacy-title">Liberdade combina com <em>controle.</em></h2>
            <p>No NoSigilo, você define seus limites, sua exposição e o ritmo de cada conexão.</p>

            <div className="campaign-privacy-list">
              {privacyItems.map(({ title, description, icon: Icon }) => (
                <div className="campaign-privacy-item" key={title}>
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </div>

          <figure className="campaign-privacy-media">
            <img src="/landing/gaze-couple-722.webp" alt="Casal adulto mascarado se observando com discrição" width={722} height={481} loading="lazy" />
          </figure>
        </div>
      </section>

      <section className="campaign-audience campaign-section" aria-labelledby="campaign-audience-title">
        <figure className="campaign-audience-media">
          <img
            src="/landing/hero-liberal-party.jpg"
            alt="Adultos conversando em um encontro social descontraído"
            width={1024}
            height={768}
            loading="lazy"
          />
        </figure>

        <div className="campaign-audience-copy">
          <h2 id="campaign-audience-title">Um espaço para quem quer viver <em>novas possibilidades.</em></h2>

          <div className="campaign-audience-list">
            {audiences.map(({ title, description, icon: Icon }) => (
              <div className="campaign-audience-item" key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="campaign-faq campaign-section" aria-labelledby="campaign-faq-title">
        <h2 id="campaign-faq-title">Ainda pensando se é para você?</h2>

        <div className="campaign-faq-list">
          {questions.map(({ title, description, icon: Icon }) => (
            <div className="campaign-faq-item" key={title}>
              <Icon aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="campaign-final" aria-labelledby="campaign-final-title">
        <div className="campaign-final-inner">
          <div>
            <h2 id="campaign-final-title">Seu próximo encontro pode começar com um perfil.</h2>
            <p>Crie sua conta gratuitamente e descubra quem está na mesma sintonia.</p>
          </div>

          <div className="campaign-final-actions">
            <Link className="campaign-cta campaign-cta--light" to={homeDestination}>
              Entrar para a comunidade
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="campaign-final-login" to={loginDestination}>Já tenho uma conta</Link>
          </div>
        </div>
      </section>

      <footer className="campaign-footer">
        <BrandLogo size="sm" className="campaign-brand" textClassName="campaign-footer-brand-text" />
        <div className="campaign-footer-age">
          <BadgeCheck aria-hidden="true" />
          <span>Comunidade exclusiva para maiores de 18 anos.</span>
        </div>
      </footer>
    </main>
  );
}
