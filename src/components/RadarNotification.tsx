import React from 'react';
import { MapPin, MessageCircle, Clock, User, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface RadarNotificationProps {
  id: string;
  senderName?: string;
  senderAvatar?: string;
  senderAge?: number;
  city: string;
  state: string;
  message: string;
  receivedAt: Date;
  isAnonymous?: boolean;
  onRespond?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function RadarNotification({
  id,
  senderName,
  senderAvatar,
  senderAge,
  city,
  state,
  message,
  receivedAt,
  isAnonymous = false,
  onRespond,
  onDismiss,
}: RadarNotificationProps) {
  const timeAgo = React.useMemo(() => {
    const diff = Date.now() - receivedAt.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  }, [receivedAt]);

  return (
    <Card className="glass border-primary/30 overflow-hidden animate-fade-in">
      {/* Radar pulse indicator */}
      <div className="h-1 bg-gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-white/30 animate-pulse" />
      </div>
      
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative">
            {isAnonymous ? (
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <User className="w-6 h-6 text-muted-foreground" />
              </div>
            ) : (
              <Avatar className="w-12 h-12 border-2 border-primary/30">
                <AvatarImage src={senderAvatar} alt={senderName} />
                <AvatarFallback>{senderName?.[0] || '?'}</AvatarFallback>
              </Avatar>
            )}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Radio className="w-3 h-3 text-primary-foreground" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold truncate">
                {isAnonymous ? 'Alguém' : senderName}
                {senderAge && !isAnonymous && `, ${senderAge}`}
              </span>
              <Badge variant="secondary" className="text-xs">
                <MapPin className="w-3 h-3 mr-1" />
                Viajante
              </Badge>
            </div>
            
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
              <MapPin className="w-3 h-3" />
              <span>Está em {city}, {state}</span>
              <span className="mx-1">•</span>
              <Clock className="w-3 h-3" />
              <span>{timeAgo}</span>
            </div>

            <p className="text-sm mb-3 line-clamp-2">{message}</p>

            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                onClick={() => onRespond?.(id)}
                className="flex-1 sm:flex-none"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                Responder
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onDismiss?.(id)}
              >
                Ignorar
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// List component to show multiple radar notifications
interface RadarNotificationsListProps {
  notifications: RadarNotificationProps[];
  onRespond?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function RadarNotificationsList({ 
  notifications, 
  onRespond, 
  onDismiss 
}: RadarNotificationsListProps) {
  if (notifications.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Radio className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Nenhuma notificação de radar</p>
        <p className="text-sm">
          Quando viajantes procurarem pessoas como você, você verá aqui
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          Viajantes na sua cidade
        </h3>
        <Badge variant="secondary">{notifications.length} novas</Badge>
      </div>
      
      {notifications.map((notification) => (
        <RadarNotification
          key={notification.id}
          {...notification}
          onRespond={onRespond}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
