import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { appService } from '@/services/api';
import { modoDeUso } from '@/utils/modoDeUso';

function getDeviceType(width: number) {
  if (width < 768) return 'mobile' as const;
  if (width < 1024) return 'tablet' as const;
  return 'desktop' as const;
}

// Referência e UTM valem só na PRIMEIRA tela da sessão.
//
// O site é uma página só (SPA): `document.referrer` continua sendo o Google
// (ou o Instagram) em toda navegação interna. Medido em 23/09/2026: das 2.988
// visitas com origem Google em 24h, 2.653 eram de gente já logada clicando
// entre Chat, Feed e Match — o Search Console registrou 59 cliques no mesmo
// período. Sem isso, o painel de origem conta o mesmo visitante dezenas de
// vezes e parece que o Google traz um tráfego que ele não traz.
const CHAVE_ORIGEM_USADA = 'nosigilo:origem-registrada';

function primeiraTelaDaSessao(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_ORIGEM_USADA)) return false;
    sessionStorage.setItem(CHAVE_ORIGEM_USADA, '1');
    return true;
  } catch {
    // Sessão bloqueada: sem como saber, não manda referência (erra para menos).
    return false;
  }
}

export default function SiteVisitTracker() {
  const location = useLocation();
  const lastTrackedRef = useRef<string>('');

  useEffect(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    if (lastTrackedRef.current === path) return;
    lastTrackedRef.current = path;

    const params = new URLSearchParams(location.search);
    const ehPrimeiraTela = primeiraTelaDaSessao();
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

    void appService.trackVisit({
      path,
      title: typeof document !== 'undefined' ? document.title : '',
      // Nas telas seguintes manda o próprio site como referência: assim elas
      // entram como "dentro do próprio site" em vez de virar "direto", que
      // inflaria outra coluna do painel.
      referrer: typeof document === 'undefined'
        ? ''
        : ehPrimeiraTela
          ? document.referrer
          : window.location.origin,
      utmSource: ehPrimeiraTela ? params.get('utm_source') || undefined : undefined,
      utmMedium: ehPrimeiraTela ? params.get('utm_medium') || undefined : undefined,
      utmCampaign: ehPrimeiraTela ? params.get('utm_campaign') || undefined : undefined,
      utmTerm: ehPrimeiraTela ? params.get('utm_term') || undefined : undefined,
      utmContent: ehPrimeiraTela ? params.get('utm_content') || undefined : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: typeof navigator !== 'undefined' ? navigator.language : 'pt-BR',
      deviceType: getDeviceType(screenWidth),
      displayMode: modoDeUso(),
      screenWidth,
      screenHeight,
    }).catch(() => undefined);
  }, [location.hash, location.pathname, location.search]);

  return null;
}
