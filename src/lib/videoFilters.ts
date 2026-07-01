// Filtros da Busca de Vídeos — compartilhados entre a página de busca e o Reels,
// e persistidos no dispositivo (localStorage) para lembrar a última escolha.

export type VideoSort = 'recent' | 'liked' | 'commented';

export type VideoFilters = {
  gender: string;   // 'prefs' (meus interesses) | 'all' (todos) | gênero específico
  city: string;
  distance: string; // 'all' | '10' | '25' | '50' | '100' | '250'
  sort: VideoSort;
  onlyUnseen: boolean;
};

export const DEFAULT_VIDEO_FILTERS: VideoFilters = {
  gender: 'prefs',
  city: '',
  distance: 'all',
  sort: 'recent',
  onlyUnseen: false,
};

const STORAGE_KEY = 'nosigilo:video-filters';

export function readVideoFilters(): VideoFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VIDEO_FILTERS };
    const p = JSON.parse(raw) as Partial<VideoFilters>;
    const sort: VideoSort = (['recent', 'liked', 'commented'] as const).includes(p.sort as VideoSort)
      ? (p.sort as VideoSort)
      : DEFAULT_VIDEO_FILTERS.sort;
    return {
      gender: typeof p.gender === 'string' ? p.gender : DEFAULT_VIDEO_FILTERS.gender,
      city: typeof p.city === 'string' ? p.city : DEFAULT_VIDEO_FILTERS.city,
      distance: typeof p.distance === 'string' ? p.distance : DEFAULT_VIDEO_FILTERS.distance,
      sort,
      onlyUnseen: typeof p.onlyUnseen === 'boolean' ? p.onlyUnseen : DEFAULT_VIDEO_FILTERS.onlyUnseen,
    };
  } catch {
    return { ...DEFAULT_VIDEO_FILTERS };
  }
}

export function writeVideoFilters(f: VideoFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch { /* storage indisponível — ignora */ }
}

// Converte os filtros salvos nos params do videoSearchService.search.
export function videoFiltersToSearchParams(f: VideoFilters, page: number, limit: number) {
  return {
    page,
    limit,
    gender: f.gender !== 'all' && f.gender !== 'prefs' ? f.gender : undefined,
    all: f.gender === 'all' ? true : undefined,
    city: f.city.trim() || undefined,
    maxDistanceKm: f.distance !== 'all' ? Number(f.distance) : undefined,
    sort: f.sort !== 'recent' ? f.sort : undefined,
  };
}
