import { useEffect, useState } from 'react';
import { Search, Filter, MapPin, Heart, Sparkles, Radar as RadarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { matchService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { calculateAge } from '@/utils/age';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NavLink } from 'react-router-dom';
import { UserAvatar } from '@/components/UserAvatar';
import { CitySearch } from '@/components/CitySearch';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';

const genderOptions = [
  { value: 'Mulher', label: 'Mulher solteira' },
  { value: 'Homem', label: 'Homem solteiro' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)' },
  { value: 'Transexual', label: 'Pessoa trans' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)' },
  { value: 'Travesti', label: 'Travesti' },
];

export default function SearchPage() {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [onlyLiked, setOnlyLiked] = useState(false);
  const [likedProfiles, setLikedProfiles] = useState<any[]>([]);
  
  // Filters
  const [ageRange, setAgeRange] = useState('all');
  const [city, setCity] = useState('');
  const [radar, setRadar] = useState('50');
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);

  const handleGenderToggle = (gender: string) => {
    setSelectedGenders(prev => 
      prev.includes(gender) 
        ? prev.filter(g => g !== gender)
        : [...prev, gender]
    );
  };

  const filterLikedProfiles = (profiles: any[]) => {
    const searchValue = search.trim().toLowerCase();
    const cityValue = city.trim().toLowerCase();
    return profiles.filter((profile) => {
      const name = String(profile?.name || '').toLowerCase();
      const profileCity = String(profile?.city || '').toLowerCase();
      const profileState = String(profile?.state || '').toLowerCase();
      const profileGender = String(profile?.gender || '');
      const age = calculateAge(profile?.birthDate);

      if (searchValue && !name.includes(searchValue) && !profileCity.includes(searchValue) && !profileState.includes(searchValue)) {
        return false;
      }

      if (cityValue && !profileCity.includes(cityValue) && !profileState.includes(cityValue)) {
        return false;
      }

      if (selectedGenders.length > 0 && !selectedGenders.includes(profileGender)) {
        return false;
      }

      if (ageRange !== 'all') {
        if (!age) return false;
        if (ageRange === '18-25' && (age < 18 || age > 25)) return false;
        if (ageRange === '26-35' && (age < 26 || age > 35)) return false;
        if (ageRange === '36-45' && (age < 36 || age > 45)) return false;
        if (ageRange === '45+' && age < 45) return false;
      }

      return true;
    });
  };

  const loadResults = async () => {
    setIsLoading(true);
    try {
      if (onlyLiked) {
        const likedData = await matchService.getLikedProfiles();
        const likedArray = Array.isArray(likedData) ? likedData : [];
        setLikedProfiles(likedArray);
        setResults(filterLikedProfiles(likedArray));
        return;
      }

      const params = {
        city: city.trim() || undefined,
        search: search.trim() || undefined,
        ageRange: ageRange !== 'all' ? ageRange : undefined,
        genders: selectedGenders.length > 0 ? selectedGenders.join(',') : undefined,
        radar: radar !== 'all' ? radar : undefined,
      };
      const data = await matchService.getCards(params);
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    matchService
      .getLikedProfiles()
      .then((list) => setLikedProfiles(Array.isArray(list) ? list : []))
      .catch(() => setLikedProfiles([]));
  }, []);

  // Automatic search for city and name with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadResults();
    }, 500);

    return () => clearTimeout(timer);
  }, [city, search, onlyLiked]);

  // Search when other filters change
  useEffect(() => {
    void loadResults();
  }, [ageRange, radar, selectedGenders, onlyLiked]);

  return (
    <div className="max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Buscar</h1>
        <p className="text-muted-foreground">Encontre casais e singles compatíveis com o seu interesse</p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant={onlyLiked ? 'default' : 'outline'}
            onClick={() => setOnlyLiked((prev) => !prev)}
            className={
              onlyLiked
                ? 'animate-liked-filter gap-2 border-0 bg-gradient-primary text-white hover:opacity-95 motion-reduce:animate-none'
                : 'gap-2 border-primary/50 bg-primary/5 text-primary hover:bg-primary/10'
            }
          >
            <Heart className={onlyLiked ? 'w-4 h-4 fill-current' : 'w-4 h-4'} />
            Somente curtidos
            <span
              className={
                onlyLiked
                  ? 'rounded-full bg-pink-300/30 px-2 py-0.5 text-xs font-semibold text-white'
                  : 'rounded-full bg-pink-500/15 px-2 py-0.5 text-xs font-semibold text-pink-600'
              }
            >
              {likedProfiles.length}
            </span>
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2 sm:self-auto"
          >
            <Filter className="w-4 h-4" />
            Filtros
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="glass rounded-xl p-4 sm:p-6 mb-6 animate-slide-up space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Idade</label>
              <Select value={ageRange} onValueChange={setAgeRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="18-25">18-25</SelectItem>
                  <SelectItem value="26-35">26-35</SelectItem>
                  <SelectItem value="36-45">36-45</SelectItem>
                  <SelectItem value="45+">45+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-center md:text-left">Radar (km)</label>
              <div className="relative">
                <RadarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Select value={radar} onValueChange={setRadar}>
                  <SelectTrigger className="pl-9">
                    <SelectValue placeholder="Raio de busca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualquer</SelectItem>
                    <SelectItem value="10">Até 10 km</SelectItem>
                    <SelectItem value="25">Até 25 km</SelectItem>
                    <SelectItem value="50">Até 50 km</SelectItem>
                    <SelectItem value="100">Até 100 km</SelectItem>
                    <SelectItem value="500">Até 500 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Cidade</label>
              <CitySearch 
                value={city} 
                onChange={setCity} 
                onSelect={(c) => setCity(c)}
                showLocate={false} 
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">Perfis que você quer encontrar</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-2">
              {genderOptions.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2 group cursor-pointer" onClick={() => handleGenderToggle(opt.value)}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedGenders.includes(opt.value) 
                      ? 'border-primary bg-primary/10' 
                      : 'border-muted-foreground/30 group-hover:border-primary/50'
                  }`}>
                    {selectedGenders.includes(opt.value) && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm cursor-pointer select-none">
                    {opt.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Priorização sugerida do NoSigilo: casais, mulheres solteiras e homens solteiros, conforme o filtro escolhido.</p>
          </div>

          <div className="flex justify-stretch sm:justify-end">
            <Button onClick={() => void loadResults()} className="w-full sm:w-auto bg-gradient-primary hover:opacity-90 px-8">
              Aplicar Filtros
            </Button>
          </div>
        </div>
      )}

      {/* Results Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Buscando perfis...</div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {onlyLiked ? 'Nenhum perfil curtido encontrado com esses filtros.' : 'Nenhum perfil encontrado com esses filtros.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {results.map((profile) => {
            const age = calculateAge(profile.birthDate);
            return (
              <NavLink
                key={profile.id}
                to={`/users/${profile.id}`}
                className="group relative rounded-2xl overflow-hidden cursor-pointer hover:shadow-glow transition-all"
              >
                <div className="aspect-[3/4] w-full h-full">
                  <UserAvatar 
                    user={profile} 
                    className="w-full h-full rounded-none" 
                    indicatorClassName="hidden" 
                  />
                </div>
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                {/* Online Indicator / Last Seen */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {profile.isOnline ? (
                    <span className="w-3 h-3 bg-success rounded-full ring-2 ring-background" title="Online agora" />
                  ) : profile.lastSeenAt ? (
                    <Badge variant="secondary" className="bg-black/40 text-white border-none text-[10px] backdrop-blur-md">
                      {format(new Date(profile.lastSeenAt), "HH:mm", { locale: ptBR })}
                    </Badge>
                  ) : null}
                </div>

                {/* Badges */}
                {profile.isVerified && (
                  <Badge className="absolute top-3 left-3 bg-success/90 text-white gap-1">
                    <Sparkles className="w-3 h-3" />
                  </Badge>
                )}

                {/* Info */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="text-white font-semibold text-sm sm:text-lg leading-tight">
                    {profile.name}{age ? `, ${age}` : ''}
                  </h3>
                  {formatProfileIdentityLine(profile) ? (
                    <div className="text-sm text-white/70">{formatProfileIdentityLine(profile)}</div>
                  ) : (
                    <div className="flex items-center gap-1 text-white/70 text-sm">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{profile.city || '—'}</span>
                    </div>
                  )}
                </div>

                {/* Hover Actions */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="icon" className="w-14 h-14 rounded-full bg-gradient-primary shadow-glow">
                    <Heart className="w-6 h-6" />
                  </Button>
                </div>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
