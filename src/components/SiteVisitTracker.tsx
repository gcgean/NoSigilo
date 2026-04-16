import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { appService } from '@/services/api';

function getDeviceType(width: number) {
  if (width < 768) return 'mobile' as const;
  if (width < 1024) return 'tablet' as const;
  return 'desktop' as const;
}

export default function SiteVisitTracker() {
  const location = useLocation();
  const lastTrackedRef = useRef<string>('');

  useEffect(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    if (lastTrackedRef.current === path) return;
    lastTrackedRef.current = path;

    const params = new URLSearchParams(location.search);
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

    void appService.trackVisit({
      path,
      title: typeof document !== 'undefined' ? document.title : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
      utmTerm: params.get('utm_term') || undefined,
      utmContent: params.get('utm_content') || undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: typeof navigator !== 'undefined' ? navigator.language : 'pt-BR',
      deviceType: getDeviceType(screenWidth),
      screenWidth,
      screenHeight,
    }).catch(() => undefined);
  }, [location.hash, location.pathname, location.search]);

  return null;
}
