import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  EyeOff,
  Image as ImageIcon,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { appService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { getLastAuthRoute } from '@/utils/sessionNavigation';
import './Landing.css';

const EXPERIENCE_ITEMS = [
  {
    icon: Search,
    title: 'Descobrir',
    description: 'Encontre pessoas com interesses em comum, perto de você.',
  },
  {
    icon: LockKeyhole,
    title: 'Fotos privadas',
    description: 'Compartilhe apenas com quem você escolher.',
  },
  {
    icon: MessageCircle,
    title: 'Conversa reservada',
    description: 'Mensagens e conteúdos para conversar no seu ritmo.',
  },
  {
    icon: MapPin,
    title: 'Estou Aqui',
    description: 'Mostre sua disponibilidade de forma discreta e no seu tempo.',
  },
];

const PRIVACY_ITEMS = [
  {
    icon: ImageIcon,
    title: 'Fotos sob seu controle',
    description: 'Você escolhe o que é público, privado e quem pode ter acesso.',
  },
  {
    icon: EyeOff,
    title: 'Visualização única',
    description: 'Compartilhe momentos que desaparecem depois de vistos.',
  },
  {
    icon: Users,
    title: 'Ambiente adulto e respeitoso',
    description: 'Consentimento, moderação e discrição fazem parte da experiência.',
  },
];

const TESTIMONIALS = [
  {
    text: 'Discreta, bonita e feita para quem entende o meio.',
    profile: 'Casal • SP',
  },
  {
    text: 'Aqui eu escolho o quanto quero revelar. Isso muda tudo.',
    profile: 'Mulher solteira • RJ',
  },
  {
    text: 'Finalmente um lugar com intenção, respeito e pessoas reais.',
    profile: 'Homem solteiro • MG',
  },
];

const LANDING_PROFILE_TYPES = [
  { value: 'Casal (Ele/Ela)', label: 'Casal', icon: Users },
  { value: 'Mulher', label: 'Mulher', icon: UserRound },
  { value: 'Homem', label: 'Homem', icon: UserRound },
  { value: 'other', label: 'Outros', icon: Sparkles },
] as const;

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(true);
  const [seoOpen, setSeoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // O header vira sólido só depois de passar o hero — em cima da foto ele
  // continua transparente, como sempre foi.
  const [headerSolid, setHeaderSolid] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('');
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  // Fechar sempre devolve o foco ao botão, senão quem navega por teclado ou
  // leitor de tela fica perdido no topo do documento.
  const closeMenu = useCallback((devolverFoco = true) => {
    setMenuOpen((aberto) => {
      if (aberto && devolverFoco) menuButtonRef.current?.focus();
      return false;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    appService.getSettings()
      .then((settings) => {
        if (!cancelled) {
          setSubscriptionsEnabled(settings?.subscriptionsEnabled !== false);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  // O header era `absolute` e ficava por cima do hero. Agora que é `sticky`
  // ele ocupa espaço no fluxo, então devolvemos exatamente a altura dele em
  // margem negativa — o layout fica pixel a pixel como antes.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const medir = () => {
      el.style.setProperty('--landing-header-h', `${el.offsetHeight}px`);
    };
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fundo sólido a partir do fim do hero.
  useEffect(() => {
    const aoRolar = () => {
      const limite = heroRef.current?.offsetHeight ?? window.innerHeight;
      setHeaderSolid(window.scrollY > limite);
    };
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar);
    return () => {
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
    };
  }, []);

  // Menu aberto: Escape fecha, toque fora fecha e o fundo para de rolar.
  useEffect(() => {
    if (!menuOpen) return;

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      }
    };
    const aoTocarFora = (e: Event) => {
      const alvo = e.target as Node;
      if (menuPanelRef.current?.contains(alvo)) return;
      if (menuButtonRef.current?.contains(alvo)) return; // o próprio botão já alterna
      closeMenu(false);
    };

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', aoTeclar);
    // `pointerdown` cobre toque e mouse, e dispara antes do clique no link.
    document.addEventListener('pointerdown', aoTocarFora);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoTocarFora);
    };
  }, [menuOpen, closeMenu]);

  if (isAuthenticated) {
    return <Navigate to={getLastAuthRoute('/feed')} replace />;
  }

  const handleEnter = () => navigate('/login');
  const handleQuickRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProfile) return;

    navigate(
      selectedProfile === 'other'
        ? '/register'
        : `/register?profile=${encodeURIComponent(selectedProfile)}`
    );
  };

  return (
    <div className="landing-editorial">
      <header
        ref={headerRef}
        className={`landing-header${headerSolid ? ' is-solid' : ''}`}
      >
        <div className="landing-shell landing-nav">
          <Link to="/" aria-label="Página inicial do NoSigilo.net">
            <BrandLogo
              size="sm"
              className="landing-brand"
              markClassName="landing-brand-mark"
              textClassName="landing-brand-text"
            />
          </Link>

          <nav className="landing-nav-links" aria-label="Navegação principal">
            <a href="#experiencia">Experiência</a>
            <a href="#privacidade">Privacidade</a>
            <a href="#relatos">Relatos</a>
          </nav>

          <div className="landing-nav-actions">
            <Button type="button" variant="ghost" className="landing-login" onClick={handleEnter}>
              Entrar
            </Button>
            <Button asChild className="landing-primary-button landing-header-cta">
              <Link to="/register">Cadastrar</Link>
            </Button>
            <button
              ref={menuButtonRef}
              type="button"
              className="landing-menu-button"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav
            ref={menuPanelRef}
            id="landing-mobile-menu"
            className="landing-mobile-menu"
            aria-label="Navegação móvel"
          >
            <a href="#experiencia" onClick={() => closeMenu(false)}>Experiência</a>
            <a href="#privacidade" onClick={() => closeMenu(false)}>Privacidade</a>
            <a href="#relatos" onClick={() => closeMenu(false)}>Relatos</a>
            {/* Estes três só existiam no rodapé, a ~7.500px do topo. */}
            {subscriptionsEnabled ? (
              <Link to="/subscriptions" onClick={() => closeMenu(false)}>Planos</Link>
            ) : null}
            <Link to="/terms" onClick={() => closeMenu(false)}>Termos</Link>
            <Link to="/guidelines" onClick={() => closeMenu(false)}>Diretrizes</Link>
            <button type="button" onClick={() => { closeMenu(false); handleEnter(); }}>Entrar</button>
            <Link className="landing-mobile-menu-cta" to="/register" onClick={() => closeMenu(false)}>
              Crie seu perfil gratuitamente
            </Link>
          </nav>
        ) : null}
      </header>

      <main>
        <section className="landing-hero" ref={heroRef}>
          <div className="landing-hero-image" role="img" aria-label="Adultos em um encontro social descontraído em um bar" />
          <div className="landing-hero-vignette" />
          <div className="landing-shell landing-hero-content">
            <div className="landing-hero-copy">
              <p className="landing-hero-eyebrow">Comunidade liberal · 18+</p>
              <h1>
                O que parece proibido lá fora, <em>aqui pode ser vivido.</em>
              </h1>
              <p>
                A comunidade liberal para casais e singles que desejam viver swing,
                troca de casais, ménage e exibicionismo com liberdade, consentimento,
                discrição e sigilo.
              </p>
              <a className="landing-hero-discover" href="#experiencia">
                Conheça a experiência
                <ArrowRight aria-hidden="true" />
              </a>
            </div>

            <form className="landing-quick-register" onSubmit={handleQuickRegister}>
              <div className="landing-quick-register-heading">
                <span>Seu primeiro passo</span>
                <h2>Como você quer entrar?</h2>
                <p>Escolha seu perfil e comece gratuitamente.</p>
              </div>

              <fieldset>
                <legend className="sr-only">Escolha o tipo de perfil</legend>
                <div className="landing-profile-options">
                  {LANDING_PROFILE_TYPES.map(({ value, label, icon: Icon }) => {
                    const selected = selectedProfile === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={selected ? 'is-selected' : undefined}
                        aria-pressed={selected}
                        onClick={() => setSelectedProfile(value)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <Button
                type="submit"
                size="lg"
                className="landing-primary-button landing-quick-register-submit"
                disabled={!selectedProfile}
              >
                Criar meu perfil grátis
                <ArrowRight data-icon="inline-end" />
              </Button>

              <p className="landing-quick-register-login">
                Já tenho cadastro
                <button type="button" onClick={handleEnter}>Entrar</button>
              </p>
              <p className="landing-quick-register-note">
                <ShieldCheck aria-hidden="true" />
                Você controla o que exibe.
              </p>
            </form>
          </div>
          <a className="landing-scroll-cue" href="#experiencia" aria-label="Ir para a próxima seção">
            Descubra
            <ChevronDown aria-hidden="true" />
          </a>
        </section>

        <section id="desejo" className="landing-desire landing-section">
          <div className="landing-shell landing-desire-grid">
            <figure className="landing-desire-image landing-desire-lead">
              <img
                src="/landing/desire-kiss-trio.webp"
                width={840}
                height={560}
                alt="Três adultos em um momento de intimidade e desejo consensual"
                loading="lazy"
                decoding="async"
              />
            </figure>

            <div className="landing-desire-copy">
              <h2>O desejo começa <em>no olhar.</em></h2>
              <span aria-hidden="true" />
              <p className="landing-desire-statement">Máscaras escondem rostos. A química revela intenções.</p>
              <p className="landing-desire-support">Casais e singles. Swing, ménage e exibicionismo no seu tempo.</p>
              <Button asChild variant="link" className="landing-text-link">
                <Link to="/register">
                  Quero fazer parte
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>

            <figure className="landing-desire-image landing-desire-portrait">
              <img
                className="landing-desire-portrait-top"
                src="/landing/masked-woman-722.webp"
                srcSet="/landing/masked-woman-361.webp 361w, /landing/masked-woman-722.webp 722w"
                sizes="(max-width: 900px) 100vw, 361px"
                width={722}
                height={481}
                alt="Mulher adulta mascarada em um baile elegante"
                loading="lazy"
                decoding="async"
              />
              <img
                className="landing-desire-portrait-center"
                src="/landing/lounge-trio.jpg"
                width={640}
                height={425}
                alt="Três adultos juntos em um ambiente reservado"
                loading="lazy"
                decoding="async"
              />
              <img
                className="landing-desire-portrait-bottom"
                src="/landing/first-touch-722.webp"
                srcSet="/landing/first-touch-361.webp 361w, /landing/first-touch-722.webp 722w"
                sizes="(max-width: 900px) 100vw, 361px"
                width={722}
                height={481}
                alt="Casal adulto mascarado trocando olhares em um encontro elegante"
                loading="lazy"
                decoding="async"
              />
            </figure>

            <figure className="landing-desire-image landing-desire-touch">
              <img
                src="/landing/bed-trio.webp"
                width={600}
                height={400}
                alt="Três adultos deitados próximos em um encontro consensual"
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
        </section>

        <section id="experiencia" className="landing-experience landing-section">
          <div className="landing-shell landing-experience-grid">
            <ProductShowcase />

            <div className="landing-section-copy">
              <h2>Uma experiência feita para <em>aproximar, sem expor.</em></h2>
              <p className="landing-section-intro">
                Encontre casais e singles para swing, troca de casais, ménage e novas
                experiências — sempre com consentimento e discrição.
              </p>

              <div className="landing-feature-list">
                {EXPERIENCE_ITEMS.map(({ icon: Icon, title, description }) => (
                  <div className="landing-feature-row" key={title}>
                    <div className="landing-feature-icon"><Icon aria-hidden="true" /></div>
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button asChild variant="link" className="landing-text-link">
                <Link to="/register">
                  Começar a descobrir
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="privacidade" className="landing-privacy landing-section">
          <div className="landing-privacy-image" role="img" aria-label="Três adultos conversando em uma hidromassagem" />
          <div className="landing-privacy-fade" />
          <div className="landing-shell landing-privacy-content">
            <div className="landing-privacy-copy">
              <h2>Você decide o que mostrar. <em>E para quem.</em></h2>
              <p className="landing-section-intro">Privacidade não é detalhe. É parte da experiência.</p>

              <div className="landing-privacy-list">
                {PRIVACY_ITEMS.map(({ icon: Icon, title, description }) => (
                  <div className="landing-privacy-row" key={title}>
                    <Icon aria-hidden="true" />
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button asChild variant="link" className="landing-text-link">
                <Link to="/privacy">
                  Ver como protegemos você
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="relatos" className="landing-testimonials landing-section">
          <div className="landing-shell">
            <div className="landing-testimonials-heading">
              <Sparkles aria-hidden="true" />
              <h2>Há encontros que começam muito <em>antes do primeiro oi.</em></h2>
            </div>

            <div className="landing-quotes">
              {TESTIMONIALS.map((testimonial) => (
                <figure key={testimonial.profile}>
                  <blockquote>“{testimonial.text}”</blockquote>
                  <figcaption>{testimonial.profile}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-final-cta landing-section">
          <div className="landing-final-light" aria-hidden="true" />
          <div className="landing-shell landing-final-content">
            <div>
              <h2>Talvez o próximo capítulo comece <em>aqui.</em></h2>
              <p>Entre com calma. Revele no seu tempo. Descubra quem está na mesma sintonia.</p>
            </div>
            <div className="landing-final-actions">
              <Button asChild size="lg" className="landing-primary-button">
                <Link to="/register">
                  Crie seu perfil gratuitamente
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button type="button" variant="link" className="landing-text-link" onClick={handleEnter}>
                Já tenho uma conta
              </Button>
              {subscriptionsEnabled ? (
                <Link className="landing-plans-link" to="/subscriptions">Conhecer os planos</Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="landing-seo">
          <div className="landing-shell landing-seo-inner">
            <button
              type="button"
              onClick={() => setSeoOpen((open) => !open)}
              aria-expanded={seoOpen}
            >
              <span>Swing, troca de casais e encontros liberais no Brasil</span>
              <ChevronDown className={seoOpen ? 'is-open' : ''} aria-hidden="true" />
            </button>

            <div className={seoOpen ? 'landing-seo-content is-open' : 'landing-seo-content'} aria-hidden={!seoOpen}>
              <div>
                <h3>Swing e troca de casais em todo o Brasil</h3>
                <p>
                  O NoSigilo conecta casais e singles do meio liberal em um ambiente discreto,
                  pensado para quem busca swing, troca de casais, ménage e encontros consensuais
                  longe da exposição das redes sociais comuns.
                </p>
              </div>
              <div>
                <h3>Liberdade, respeito e controle</h3>
                <p>
                  Fotos privadas, mensagens com visualização única e a função Estou Aqui ajudam
                  você a descobrir novas conexões preservando seus limites e sua privacidade.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-content">
          <BrandLogo
            size="sm"
            className="landing-brand"
            markClassName="landing-brand-mark"
            textClassName="landing-brand-text"
          />
          <nav aria-label="Links institucionais">
            <Link to="/terms">Termos</Link>
            <Link to="/privacy">Privacidade</Link>
            <Link to="/guidelines">Diretrizes</Link>
            {subscriptionsEnabled ? <Link to="/subscriptions">Planos</Link> : null}
          </nav>
          <p>© {new Date().getFullYear()} NoSigilo.net</p>
        </div>
      </footer>
    </div>
  );
}

function ProductShowcase() {
  return (
    <div className="landing-product-stage" aria-label="Prévia visual da experiência NoSigilo">
      <div className="landing-orbit" aria-hidden="true" />
      <div className="landing-fabric" aria-hidden="true" />

      <div className="landing-phone landing-phone-main">
        <div className="landing-phone-bar"><span>9:41</span><span>● ● ●</span></div>
        <div className="landing-phone-title"><strong>NoSigilo</strong><ShieldCheck /></div>
        <h3>Descobrir</h3>
        <div className="landing-phone-filters"><b>Todos</b><span>Online</span><span>Novos</span></div>
        <div className="landing-profile-photo">
          <div className="landing-profile-silhouette" />
          <button type="button" aria-label="Adicionar aos favoritos">♥</button>
        </div>
        <div className="landing-profile-meta">
          <strong>Camila, 32</strong>
          <span><MapPin /> 3 km de você</span>
        </div>
        <div className="landing-phone-tabs"><Search /><MessageCircle /><MapPin /><Users /></div>
      </div>

      <div className="landing-mini-screen landing-private-screen">
        <LockKeyhole />
        <strong>Conteúdo privado</strong>
        <p>Você escolhe quem pode ver.</p>
        <span>Solicitar acesso</span>
      </div>

      <div className="landing-mini-screen landing-chat-screen">
        <div><i /> <strong>Conversa reservada</strong></div>
        <p>Oi, tudo bem?</p>
        <p>Oi! Tudo ótimo por aqui.</p>
        <span>Digite uma mensagem…</span>
      </div>
    </div>
  );
}
