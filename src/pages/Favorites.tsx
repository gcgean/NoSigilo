import { Heart, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { useFavorites } from '@/contexts/FavoritesContext';
import { Card } from '@/components/ui/card';

export default function Favorites() {
  const { favorites, removeFavorite } = useFavorites();

  return (
    <div className="max-w-3xl mx-auto w-full">
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
                  <AvatarImage src={favorite.avatar || undefined} />
                  <AvatarFallback>{String(favorite.name || 'U')[0]}</AvatarFallback>
                </Avatar>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Link to={`/users/${favorite.id}`} className="font-semibold hover:underline">
                    {favorite.name}
                  </Link>
                </div>
                <span className="text-sm text-muted-foreground">Salvo em {new Date(favorite.addedAt).toLocaleDateString()}</span>
              </div>

              <div className="flex items-center gap-2">
                <Link to={`/users/${favorite.id}`}>
                  <Button variant="outline">Ver perfil</Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeFavorite(favorite.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="text-center py-16 glass rounded-xl">
          <Star className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhum favorito ainda</h3>
          <p className="text-muted-foreground mb-4">
            Adicione pessoas aos seus favoritos para encontrá-las facilmente.
          </p>
          <Link to="/search">
            <Button className="bg-gradient-primary hover:opacity-90">
              Explorar Perfis
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
