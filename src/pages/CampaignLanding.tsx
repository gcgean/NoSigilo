import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BadgeCheck, Gift, LockKeyhole, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import "./CampaignLanding.css";

const trustItems = [
  { label: "+18 e exclusivo para adultos", icon: BadgeCheck },
  { label: "Entrada gratuita", icon: Gift },
  { label: "Privacidade em primeiro lugar", icon: LockKeyhole },
];

export default function CampaignLanding() {
  const location = useLocation();
  const homeDestination = { pathname: "/", search: location.search };
  const loginDestination = { pathname: "/login", search: location.search };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Conheça o NoSigilo.net — Privacidade e novas conexões";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="campaign-landing">
      <section className="campaign-shell" aria-labelledby="campaign-title">
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

        <div className="campaign-visual" role="img" aria-label="Cortina de veludo e porta entreaberta iluminada" />

        <div className="campaign-copy">
          <h1 id="campaign-title">
            Existe um lugar onde você pode ser quem realmente é<span aria-hidden="true">.</span>
          </h1>

          <p className="campaign-intro">
            Uma comunidade privada para adultos que valorizam liberdade, respeito e conexões reais.
          </p>

          <Link className="campaign-cta" to={homeDestination}>
            Quero conhecer
            <ArrowRight aria-hidden="true" />
          </Link>

          <p className="campaign-control-note">
            <ShieldCheck aria-hidden="true" />
            Você decide quanto revelar.
          </p>
        </div>

        <div className="campaign-trust" aria-label="Diferenciais da plataforma">
          {trustItems.map(({ label, icon: Icon }) => (
            <div className="campaign-trust-item" key={label}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <footer className="campaign-footer">
          <span className="campaign-age" aria-hidden="true">18+</span>
          <span>Ao continuar, você confirma que tem 18 anos ou mais.</span>
        </footer>
      </section>
    </main>
  );
}
