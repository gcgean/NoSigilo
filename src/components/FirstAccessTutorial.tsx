import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarHeart,
  Clapperboard,
  Crown,
  Eye,
  Heart,
  Images,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { FIRST_ACCESS_TOUR_EVENT } from '@/components/firstAccessTutorialEvents';
import './FirstAccessTutorial.css';

type TourIcon = typeof Sparkles;

type TourStep = {
  id: string;
  title: string;
  highlight: string;
  description: string;
  image: string;
  imagePosition?: string;
  benefits: Array<{ icon: TourIcon; title: string; description: string }>;
  actionLabel: string;
  route?: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Existe um lado seu que ',
    highlight: 'merece ser vivido.',
    description:
      'Uma comunidade liberal para casais e singles explorarem swing, troca de casal, ménage e exibicionismo — com consentimento, discrição e liberdade.',
    image: '/landing/hero-masquerade.png',
    imagePosition: '68% center',
    benefits: [
      { icon: Users, title: 'Casais e singles', description: 'Conexões sem julgamentos e no seu ritmo.' },
      { icon: LockKeyhole, title: 'Privacidade sob controle', description: 'Você decide o que mostra e para quem.' },
      { icon: ShieldCheck, title: 'Respeito em primeiro lugar', description: 'Consentimento e sigilo fazem parte da experiência.' },
    ],
    actionLabel: 'Descobrir a comunidade',
  },
  {
    id: 'discover',
    title: 'Encontre quem combina com a sua ',
    highlight: 'curiosidade.',
    description:
      'Use o Match e a Busca para descobrir pessoas próximas, filtrar interesses e perceber quando a química é recíproca.',
    image: '/landing/gaze-couple.png',
    imagePosition: 'center',
    benefits: [
      { icon: Heart, title: 'Match por afinidade', description: 'Curta e descubra quando o interesse é mútuo.' },
      { icon: Search, title: 'Busca com filtros', description: 'Distância, perfil, interesses e disponibilidade.' },
      { icon: Zap, title: 'Encontro hoje', description: 'Veja quem está aberto a uma conexão agora.' },
    ],
    actionLabel: 'Continuar',
  },
  {
    id: 'share',
    title: 'Veja, compartilhe e deixe a imaginação ',
    highlight: 'ir além.',
    description:
      'Feed, Stories e Vídeos revelam experiências e desejos da comunidade. Você escolhe se quer observar, publicar ou provocar curiosidade.',
    image: '/landing/masked-woman.png',
    imagePosition: 'center 32%',
    benefits: [
      { icon: Images, title: 'Feed e Stories', description: 'Momentos, fotos e stories que expiram em 24h.' },
      { icon: Clapperboard, title: 'Vídeos da comunidade', description: 'Explore por cidade, novidades e interesse.' },
      { icon: Eye, title: 'Exiba-se do seu jeito', description: 'Compartilhe só o que quiser, quando quiser.' },
    ],
    actionLabel: 'Continuar',
  },
  {
    id: 'connect',
    title: 'A conversa certa transforma desejo em ',
    highlight: 'conexão.',
    description:
      'Quando houver sintonia, o Chat cria um espaço privado para conversar, alinhar expectativas e decidir o próximo passo com calma.',
    image: '/landing/first-touch.png',
    imagePosition: 'center',
    benefits: [
      { icon: MessageCircle, title: 'Chat privado', description: 'Converse com discrição antes de qualquer encontro.' },
      { icon: LockKeyhole, title: 'Fotos privadas', description: 'Libere ou revogue o acesso quando desejar.' },
      { icon: ShieldCheck, title: 'Você no controle', description: 'Seu limite, seu tempo e suas escolhas.' },
    ],
    actionLabel: 'Continuar',
  },
  {
    id: 'live',
    title: 'Do online para encontros que ',
    highlight: 'fazem sentido.',
    description:
      'Sinalize quando estiver disponível, descubra quem está por perto e encontre eventos criados pela comunidade.',
    image: '/landing/hero-editorial.png',
    imagePosition: '76% center',
    benefits: [
      { icon: Radio, title: 'Radar discreto', description: 'Avise que está na cidade sem expor sua localização exata.' },
      { icon: MapPin, title: 'Disponibilidade', description: 'Hoje, esta semana, este mês ou apenas online.' },
      { icon: CalendarHeart, title: 'Eventos liberais', description: 'Descubra encontros, festas e experiências.' },
    ],
    actionLabel: 'Continuar',
  },
  {
    id: 'premium',
    title: 'Você já viu a entrada. Agora escolha ',
    highlight: 'até onde quer ir.',
    description:
      'O Premium libera a experiência completa para conversar, interagir e participar de verdade da comunidade. Cancele quando quiser.',
    image: '/landing/privacy-editorial.png',
    imagePosition: '68% center',
    benefits: [
      { icon: MessageCircle, title: 'Converse sem barreiras', description: 'Aproxime-se de quem despertou seu interesse.' },
      { icon: Sparkles, title: 'Participe ativamente', description: 'Interaja com conteúdos e apareça para a comunidade.' },
      { icon: Crown, title: 'Viva a experiência completa', description: 'Recursos pensados para transformar curiosidade em conexão.' },
    ],
    actionLabel: 'Conhecer o Premium',
    route: '/subscriptions',
  },
];

const FEATURE_RAIL = [
  { icon: Heart, label: 'Match e Busca' },
  { icon: Images, label: 'Feed e Stories' },
  { icon: MessageCircle, label: 'Chat privado' },
  { icon: Radio, label: 'Radar e Eventos' },
  { icon: Clapperboard, label: 'Vídeos' },
  { icon: Crown, label: 'Premium' },
];

export default function FirstAccessTutorial() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const key = `nosigilo:welcome-tutorial-date:${user.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString().slice(0, 10));
    } catch {
      // O tutorial continua funcionando mesmo se o storage estiver indisponível.
    }
    setStepIndex(0);
    setOpen(true);
  }, [user?.id]);

  useEffect(() => {
    const handler = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(FIRST_ACCESS_TOUR_EVENT, handler);
    return () => window.removeEventListener(FIRST_ACCESS_TOUR_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') setStepIndex((current) => Math.max(0, current - 1));
      if (event.key === 'ArrowRight') setStepIndex((current) => Math.min(TOUR_STEPS.length - 1, current + 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  const finishTutorial = () => setOpen(false);

  const goNext = () => {
    if (!isLastStep) {
      setStepIndex((current) => current + 1);
      return;
    }
    finishTutorial();
    if (step.route) navigate(step.route);
  };

  const goPrev = () => setStepIndex((current) => Math.max(0, current - 1));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="first-access-tour">
        <DialogTitle className="sr-only">Boas-vindas à comunidade NoSigilo</DialogTitle>
        <DialogDescription className="sr-only">
          Tutorial guiado sobre os principais recursos da comunidade liberal NoSigilo.
        </DialogDescription>

        <section className="first-access-tour__media" aria-hidden="true">
          <div
            key={step.image}
            className="first-access-tour__photo"
            style={{ backgroundImage: `url(${step.image})`, backgroundPosition: step.imagePosition }}
          />
          <div className="first-access-tour__media-shade" />
          <div className="first-access-tour__brand">
            <span className="first-access-tour__brand-mark">NS</span>
            <span>NoSigilo<em>.net</em></span>
          </div>

          <div className="first-access-tour__rail">
            <span className="first-access-tour__rail-title">O que você encontrará</span>
            <div className="first-access-tour__rail-items">
              {FEATURE_RAIL.map((feature, index) => (
                <div className={cn('first-access-tour__rail-item', index === stepIndex && 'is-active')} key={feature.label}>
                  <feature.icon />
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="first-access-tour__content" key={step.id} aria-live="polite">
          <div className="first-access-tour__progress-row">
            <span>{stepIndex + 1} de {TOUR_STEPS.length}</span>
            <button type="button" onClick={finishTutorial}>Pular tutorial</button>
          </div>

          <div className="first-access-tour__copy">
            <h2>
              {step.title}<strong>{step.highlight}</strong>
            </h2>
            <p>{step.description}</p>
          </div>

          <div className="first-access-tour__benefits">
            {step.benefits.map((benefit) => (
              <div className="first-access-tour__benefit" key={benefit.title}>
                <span className="first-access-tour__benefit-icon"><benefit.icon /></span>
                <span>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.description}</small>
                </span>
              </div>
            ))}
          </div>

          <div className="first-access-tour__navigation">
            <div className="first-access-tour__dots" aria-label={`Etapa ${stepIndex + 1} de ${TOUR_STEPS.length}`}>
              {TOUR_STEPS.map((tourStep, index) => (
                <button
                  key={tourStep.id}
                  type="button"
                  className={cn(index === stepIndex && 'is-active')}
                  aria-label={`Ir para etapa ${index + 1}`}
                  aria-current={index === stepIndex ? 'step' : undefined}
                  onClick={() => setStepIndex(index)}
                />
              ))}
            </div>

            <div className="first-access-tour__actions">
              <Button
                type="button"
                variant="outline"
                className="first-access-tour__back"
                onClick={goPrev}
                disabled={stepIndex === 0}
                aria-label="Voltar uma etapa"
              >
                <ArrowLeft data-icon="inline-start" />
                Voltar
              </Button>
              <Button type="button" className="first-access-tour__next" onClick={goNext}>
                {step.actionLabel}
                {isLastStep ? <Crown data-icon="inline-end" /> : <ArrowRight data-icon="inline-end" />}
              </Button>
            </div>
          </div>

          {isLastStep ? (
            <button type="button" className="first-access-tour__explore" onClick={finishTutorial}>
              Quero explorar a comunidade primeiro
            </button>
          ) : null}

          <div className="first-access-tour__trust">
            <ShieldCheck />
            <span>Adultos 18+</span><i />
            <span>Consentimento</span><i />
            <span>Sigilo</span>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
