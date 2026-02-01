import { Heart, MessageCircle, Eye, UserPlus, Bell, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const mockNotifications = [
  {
    id: '1',
    type: 'like',
    user: {
      name: 'Marina Santos',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    },
    message: 'curtiu sua foto',
    time: '2 min',
    read: false,
  },
  {
    id: '2',
    type: 'match',
    user: {
      name: 'Carolina Lima',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
    },
    message: 'Vocês deram match! 🎉',
    time: '1h',
    read: false,
  },
  {
    id: '3',
    type: 'visit',
    user: {
      name: 'Julia Mendes',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    },
    message: 'visitou seu perfil',
    time: '3h',
    read: true,
  },
  {
    id: '4',
    type: 'comment',
    user: {
      name: 'Amanda Costa',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100',
    },
    message: 'comentou na sua foto',
    time: '5h',
    read: true,
  },
  {
    id: '5',
    type: 'friend',
    user: {
      name: 'Beatriz Silva',
      avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100',
    },
    message: 'enviou uma solicitação de amizade',
    time: '1d',
    read: true,
  },
];

const getIcon = (type: string) => {
  switch (type) {
    case 'like':
      return <Heart className="w-4 h-4 text-primary" />;
    case 'match':
      return <Sparkles className="w-4 h-4 text-gold" />;
    case 'visit':
      return <Eye className="w-4 h-4 text-accent" />;
    case 'comment':
      return <MessageCircle className="w-4 h-4 text-success" />;
    case 'friend':
      return <UserPlus className="w-4 h-4 text-primary" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
};

export default function Notifications() {
  return (
    <div className="max-w-2xl mx-auto md:ml-64">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-muted-foreground">Fique por dentro de tudo</p>
        </div>
        <Button variant="ghost" size="sm" className="gap-2">
          <Check className="w-4 h-4" />
          Marcar todas como lidas
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {mockNotifications.map((notification) => (
          <div
            key={notification.id}
            className={cn(
              "glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/50 transition-colors",
              !notification.read && "bg-primary/5 border-primary/20"
            )}
          >
            <div className="relative">
              <Avatar>
                <AvatarImage src={notification.user.avatar} />
                <AvatarFallback>{notification.user.name[0]}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card flex items-center justify-center">
                {getIcon(notification.type)}
              </div>
            </div>

            <div className="flex-1">
              <p className={cn(!notification.read && "font-medium")}>
                <span className="font-semibold">{notification.user.name}</span>{' '}
                {notification.message}
              </p>
              <span className="text-sm text-muted-foreground">{notification.time}</span>
            </div>

            {!notification.read && (
              <span className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
