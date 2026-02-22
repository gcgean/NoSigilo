import { Check, X, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const mockRequests = [
  {
    id: '1',
    user: {
      name: 'Marina Santos',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
      city: 'São Paulo',
      mutualFriends: 3,
    },
    time: '2h',
  },
  {
    id: '2',
    user: {
      name: 'Carolina Lima',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
      city: 'Rio de Janeiro',
      mutualFriends: 5,
    },
    time: '1d',
  },
  {
    id: '3',
    user: {
      name: 'Julia Mendes',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
      city: 'Curitiba',
      mutualFriends: 0,
    },
    time: '3d',
  },
];

export default function FriendRequests() {
  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
          <UserPlus className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Solicitações de Amizade</h1>
          <p className="text-muted-foreground">{mockRequests.length} pendentes</p>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {mockRequests.map((request) => (
          <div key={request.id} className="glass rounded-xl p-4 flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={request.user.avatar} />
              <AvatarFallback>{request.user.name[0]}</AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h3 className="font-semibold">{request.user.name}</h3>
              <p className="text-sm text-muted-foreground">{request.user.city}</p>
              {request.user.mutualFriends > 0 && (
                <Badge variant="secondary" className="mt-1">
                  {request.user.mutualFriends} amigos em comum
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="border-destructive text-destructive hover:bg-destructive hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                className="bg-gradient-primary hover:opacity-90"
              >
                <Check className="w-5 h-5" />
              </Button>
            </div>
          </div>
        ))}

        {mockRequests.length === 0 && (
          <div className="text-center py-12 glass rounded-xl">
            <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Nenhuma solicitação</h3>
            <p className="text-muted-foreground">
              Novas solicitações aparecerão aqui
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
