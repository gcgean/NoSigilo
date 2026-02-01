import { useState } from 'react';
import { Heart, Trash2, MessageCircle, MapPin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';

const mockFavorites = [
  {
    id: '1',
    name: 'Marina Santos',
    age: 28,
    city: 'São Paulo, SP',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    verified: true,
    online: true,
    addedAt: '2025-01-28',
  },
  {
    id: '2',
    name: 'Carolina Lima',
    age: 25,
    city: 'Rio de Janeiro, RJ',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
    verified: true,
    online: false,
    addedAt: '2025-01-25',
  },
  {
    id: '3',
    name: 'Julia Mendes',
    age: 30,
    city: 'Curitiba, PR',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    verified: false,
    online: true,
    addedAt: '2025-01-20',
  },
];

export default function Favorites() {
  const [favorites, setFavorites] = useState(mockFavorites);

  const handleRemove = (id: string) => {
    setFavorites(favorites.filter(f => f.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto md:ml-64">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
          <Heart className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Favoritos</h1>
          <p className="text-muted-foreground">{favorites.length} pessoas salvas</p>
        </div>
      </div>

      {/* Favorites List */}
      {favorites.length > 0 ? (
        <div className="space-y-4">
          {favorites.map((favorite) => (
            <div 
              key={favorite.id}
              className="glass rounded-xl p-4 flex items-center gap-4 hover:bg-secondary/30 transition-colors"
            >
              <div className="relative">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={favorite.avatar} />
                  <AvatarFallback>{favorite.name[0]}</AvatarFallback>
                </Avatar>
                {favorite.online && (
                  <span className="absolute bottom-0 right-0 w-4 h-4 bg-success rounded-full ring-2 ring-background" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{favorite.name}, {favorite.age}</h3>
                  {favorite.verified && (
                    <Sparkles className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  <span>{favorite.city}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link to="/chat">
                  <Button variant="outline" size="icon">
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleRemove(favorite.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glass rounded-xl">
          <Heart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhum favorito ainda</h3>
          <p className="text-muted-foreground mb-4">
            Adicione pessoas aos seus favoritos para encontrá-las facilmente.
          </p>
          <Link to="/search">
            <Button className="bg-gradient-primary hover:opacity-90">
              Explorar Perfis
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
