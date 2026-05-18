import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, MapPin, MessageCircle, UserCheck, UserX, Users, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NavLink, useNavigate } from 'react-router-dom';
import { friendsService, chatService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { calculateAge } from '@/utils/age';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UserAvatar } from '@/components/UserAvatar';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useToast } from '@/hooks/use-toast';

const genderOptions = [
  { value: 'Mulher', label: 'Mulher solteira' },
  { value: 'Homem', label: 'Homem solteiro' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)' },
  { value: 'Transexual', label: 'Trans' },
  { value: 'Crossdresser (CD)', label: 'CD' },
  { value: 'Travesti', label: 'Travesti' },
];

export default function FriendsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'friends' | 'requests'>('friends');
  const [search, setSearch] = useState('');
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [ageRange, setAgeRange] = useState('all');
  const [availFilter, setAvailFilter] = useState('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'available'>('recent');

  const [friends, setFriends] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await friendsService.getFriends();
      setFriends(data.friends ?? []);
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
    } catch {
      toast({ title: 'Erro ao carregar amigos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleRespond = async (requestId: string, accept: boolean) => {
    setRespondingId(requestId);
    try {
      await friendsService.respondToRequest(requestId, accept);
      toast({ title: accept ? '🤝 Amizade aceita!' : 'Solicitação recusada' });
      await load();
    } catch {
      toast({ title: 'Erro ao responder', variant: 'destructive' });
    } finally {
      setRespondingId(null);
    }
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    try {
      await friendsService.removeFriend(friendId);
      setFriends(prev => prev.filter(f => f.id !== friendId));
      toast({ title: `${friendName} removido(a) dos amigos` });
    } catch {
      toast({ title: 'Erro ao remover amigo', variant: 'destructive' });
    }
  };

  const handleStartChat = async (friendId: string) => {
    try {
      const { id } = await chatService.createConversation(friendId);
      navigate(`/chat?conversationId=${encodeURIComponent(id)}`);
    } catch {
      toast({ title: 'Não foi possível abrir a conversa', variant: 'destructive' });
    }
  };

  // ── Client-side filtering ────────────────────────────────────────────────
  const filteredFriends = useMemo(() => {
    let list = [...friends];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name?.toLowerCase().includes(q) || f.city?.toLowerCase().includes(q));
    }
    if (selectedGenders.length > 0) {
      list = list.filter(f => selectedGenders.includes(f.gender));
    }
    if (ageRange !== 'all') {
      const [minAge, maxAge] = ageRange.split('-').map(Number);
      list = list.filter(f => {
        const age = calculateAge(f.birthDate);
        if (!age) return false;
        return age >= (minAge ?? 0) && age <= (maxAge ?? 999);
      });
    }
    if (availFilter !== 'all') {
      list = list.filter(f => f.availabilityStatus === availFilter);
    }

    // Sort
    if (sort === 'name') {
      list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    } else if (sort === 'available') {
      const order: Record<string, number> = { now: 0, week: 1, month: 2, online_only: 3 };
      list.sort((a, b) => (order[a.availabilityStatus] ?? 99) - (order[b.availabilityStatus] ?? 99));
    }
    // 'recent' keeps the default DESC order from backend

    return list;
  }, [friends, search, selectedGenders, ageRange, availFilter, sort]);

  const pendingCount = incoming.length;

  // ── Profile Card ──────────────────────────────────────────────────────────
  const ProfileCard = ({ friend }: { friend: any }) => {
    const age = calculateAge(friend.birthDate);
    const avatarUrl = friend.avatar ? resolveServerUrl(friend.avatar) : undefined;
    const availStatus = friend.availabilityStatus as string | null;
    const isAvailableNow   = availStatus === 'now';
    const isAvailableWeek  = availStatus === 'week';
    const isAvailableMonth = availStatus === 'month';
    const isOnlineOnly     = availStatus === 'online_only';

    return (
      <div className="group relative min-w-0 overflow-hidden rounded-2xl transition-all hover:shadow-glow">
        {/* Avatar */}
        <NavLink to={getUserProfileHref(friend.id, undefined, '/friends')}>
          <div className="aspect-[4/5] w-full min-[420px]:aspect-[3/4] cursor-pointer">
            <UserAvatar
              user={{ ...friend, avatar: avatarUrl }}
              className="w-full h-full rounded-none"
              indicatorClassName="hidden"
            />
          </div>
        </NavLink>

        {/* Gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* Top-right: online */}
        <div className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5">
          {friend.isOnline ? (
            <span className="h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" title="Online agora" />
          ) : friend.lastSeenAt ? (
            <Badge variant="secondary" className="h-5 rounded-full border-none bg-black/40 px-2 text-[10px] font-medium text-white backdrop-blur-md">
              {format(new Date(friend.lastSeenAt), 'HH:mm', { locale: ptBR })}
            </Badge>
          ) : null}
        </div>

        {/* Top-left: verified + availability */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col gap-1">
          {friend.isVerified && (
            <Badge className="h-5 w-fit gap-1 rounded-full bg-success/90 px-2 text-[10px] font-medium text-white">
              <Sparkles className="h-3 w-3" />
            </Badge>
          )}
          {isAvailableNow && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white animate-pulse">
              <Zap className="h-3 w-3" /> Disponível hoje
            </Badge>
          )}
          {isAvailableWeek && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-orange-500/90 px-2 text-[10px] font-semibold text-white">
              <Zap className="h-3 w-3" /> Esta semana
            </Badge>
          )}
          {isAvailableMonth && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-violet-500/90 px-2 text-[10px] font-semibold text-white">
              📅 Este mês
            </Badge>
          )}
          {isOnlineOnly && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-sky-500/90 px-2 text-[10px] font-semibold text-white">
              💬 Online
            </Badge>
          )}
        </div>

        {/* Bottom info */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-3">
          <h3 className="truncate text-[0.95rem] font-semibold leading-tight text-white">
            {friend.name}{age ? `, ${age}` : ''}
          </h3>
          {formatProfileIdentityLine(friend) ? (
            <div className="truncate text-xs text-white/65">{formatProfileIdentityLine(friend)}</div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-white/65">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{friend.city || '—'}</span>
            </div>
          )}
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
          <Button
            size="sm"
            className="w-36 bg-gradient-primary gap-1.5"
            onClick={() => handleStartChat(friend.id)}
          >
            <MessageCircle className="h-4 w-4" /> Conversar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-36 border-white/30 text-white hover:bg-white/10 gap-1.5"
            onClick={() => handleRemoveFriend(friend.id, friend.name)}
          >
            <UserX className="h-4 w-4" /> Remover
          </Button>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl lg:max-w-6xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Amigos
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Match mútuo = amizade automática
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('friends')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'friends'
              ? 'text-primary border-b-2 border-primary -mb-px'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Meus Amigos
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
            {friends.length}
          </span>
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'requests'
              ? 'text-primary border-b-2 border-primary -mb-px'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Solicitações
          {pendingCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── FRIENDS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'friends' && (
        <>
          {/* Filters bar */}
          <div className="space-y-3">
            {/* Search + sort */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou cidade..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="name">Nome A-Z</SelectItem>
                  <SelectItem value="available">Disponíveis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Age + availability quick filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={ageRange} onValueChange={setAgeRange}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Faixa etária" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas idades</SelectItem>
                  <SelectItem value="18-25">18 – 25</SelectItem>
                  <SelectItem value="26-35">26 – 35</SelectItem>
                  <SelectItem value="36-45">36 – 45</SelectItem>
                  <SelectItem value="46-99">45+</SelectItem>
                </SelectContent>
              </Select>

              <Select value={availFilter} onValueChange={setAvailFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Disponibilidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer status</SelectItem>
                  <SelectItem value="now">⚡ Disponível hoje</SelectItem>
                  <SelectItem value="week">⚡ Esta semana</SelectItem>
                  <SelectItem value="month">📅 Este mês</SelectItem>
                  <SelectItem value="online_only">💬 Só online</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Gender chips */}
            <div className="flex flex-wrap gap-1.5">
              {genderOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() =>
                    setSelectedGenders(prev =>
                      prev.includes(opt.value)
                        ? prev.filter(g => g !== opt.value)
                        : [...prev, opt.value]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedGenders.includes(opt.value)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {(selectedGenders.length > 0 || ageRange !== 'all' || availFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSelectedGenders([]);
                    setAgeRange('all');
                    setAvailFilter('all');
                    setSearch('');
                  }}
                  className="rounded-full px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          {isLoading ? (
            <MobileState loading title="Carregando amigos" description="Buscando seus amigos..." />
          ) : filteredFriends.length === 0 ? (
            <MobileState
              icon={Users}
              title={friends.length === 0 ? 'Nenhum amigo ainda' : 'Nenhum amigo encontrado'}
              description={
                friends.length === 0
                  ? 'Quando você e outro perfil se curtirem mutuamente no Match, vocês viram amigos automaticamente.'
                  : 'Tente ajustar os filtros para encontrar seus amigos.'
              }
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {filteredFriends.length} amigo{filteredFriends.length !== 1 ? 's' : ''}
                {filteredFriends.length !== friends.length ? ` de ${friends.length}` : ''}
              </p>
              <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 lg:grid-cols-4 md:gap-4">
                {filteredFriends.map(friend => (
                  <ProfileCard key={friend.id} friend={friend} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── REQUESTS TAB ────────────────────────────────────────────────────── */}
      {tab === 'requests' && (
        <div className="space-y-6">
          {/* Incoming */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Recebidas ({incoming.length})
            </h2>
            {incoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma solicitação recebida.</p>
            ) : (
              <div className="space-y-2">
                {incoming.map(req => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <NavLink to={getUserProfileHref(req.fromUser.id, undefined, '/friends')}>
                      <img
                        src={req.fromUser.avatar ? resolveServerUrl(req.fromUser.avatar) : '/placeholder.svg'}
                        className="h-12 w-12 rounded-full object-cover"
                        alt={req.fromUser.name}
                      />
                    </NavLink>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{req.fromUser.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[req.fromUser.gender, req.fromUser.city].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-gradient-primary h-8 px-3 gap-1"
                        disabled={respondingId === req.id}
                        onClick={() => handleRespond(req.id, true)}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Aceitar</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 gap-1"
                        disabled={respondingId === req.id}
                        onClick={() => handleRespond(req.id, false)}
                      >
                        <UserX className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Recusar</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Outgoing */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Enviadas ({outgoing.length})
            </h2>
            {outgoing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma solicitação enviada.</p>
            ) : (
              <div className="space-y-2">
                {outgoing.map(req => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <NavLink to={getUserProfileHref(req.toUser.id, undefined, '/friends')}>
                      <img
                        src={req.toUser.avatar ? resolveServerUrl(req.toUser.avatar) : '/placeholder.svg'}
                        className="h-12 w-12 rounded-full object-cover"
                        alt={req.toUser.name}
                      />
                    </NavLink>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{req.toUser.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[req.toUser.gender, req.toUser.city].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      Aguardando
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
