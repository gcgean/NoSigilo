import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, MapPin, Calendar, MessageCircle, Crown } from 'lucide-react';
import { groupsService, type GroupSummary } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import MobileState from '@/components/MobileState';

function formatEventDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function GroupsList() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    groupsService.getGroups()
      .then((data) => { if (!cancelled) setGroups(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setGroups([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Grupos</h1>
        <p className="text-sm text-muted-foreground">
          Confirme presença em um evento para entrar automaticamente no chat do grupo.
        </p>
      </div>

      {isLoading && (
        <MobileState loading title="Carregando grupos" description="Buscando os eventos que você confirmou presença." />
      )}

      {!isLoading && groups.length === 0 && (
        <MobileState
          icon={Users}
          title="Nenhum grupo ainda"
          description="Confirme presença em um evento para entrar no chat do grupo com os outros participantes."
        />
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <button
            key={g.groupId}
            type="button"
            onClick={() => navigate(`/chat/group/${g.groupId}`)}
            className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-secondary/50"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
              {g.image ? (
                <img src={resolveServerUrl(g.image)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Calendar className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-medium">{g.title}</p>
                {g.isOrganizer && <Crown className="h-3.5 w-3.5 shrink-0 text-gold" />}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {g.date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatEventDate(g.date)}
                  </span>
                )}
                {g.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{g.location}</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {g.memberCount}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {g.lastMessagePreview ? g.lastMessagePreview : (
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Comece a conversar com o grupo</span>
                )}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
