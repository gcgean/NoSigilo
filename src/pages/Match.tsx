import { useState } from 'react';
import { Heart, X, Star, MapPin, Sparkles, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Mock data for demo
const mockProfiles = [
  {
    id: '1',
    name: 'Marina',
    age: 28,
    city: 'São Paulo',
    bio: 'Amo viagens e novas experiências. Buscando conexões verdadeiras.',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600',
    verified: true,
    premium: false,
  },
  {
    id: '2',
    name: 'Carolina',
    age: 25,
    city: 'Rio de Janeiro',
    bio: 'Fotógrafa apaixonada por arte e música.',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600',
    verified: true,
    premium: true,
  },
  {
    id: '3',
    name: 'Julia',
    age: 30,
    city: 'Curitiba',
    bio: 'Empreendedora, amo café e boas conversas.',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600',
    verified: false,
    premium: false,
  },
];

export default function Match() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const currentProfile = mockProfiles[currentIndex];

  const handleSwipe = (direction: 'left' | 'right') => {
    setSwipeDirection(direction);
    setTimeout(() => {
      setSwipeDirection(null);
      setCurrentIndex(prev => (prev + 1) % mockProfiles.length);
    }, 300);
  };

  const handleLike = () => handleSwipe('right');
  const handlePass = () => handleSwipe('left');

  return (
    <div className="max-w-lg mx-auto md:ml-64">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Match</h1>
          <p className="text-muted-foreground">Encontre sua conexão</p>
        </div>
        <Button variant="outline" size="icon">
          <Filter className="w-5 h-5" />
        </Button>
      </div>

      {/* Match Card */}
      <div className="relative aspect-[3/4] max-h-[600px]">
        <div
          className={cn(
            "absolute inset-0 rounded-3xl overflow-hidden shadow-elevated transition-all duration-300",
            swipeDirection === 'right' && 'animate-swipe-right',
            swipeDirection === 'left' && 'animate-swipe-left'
          )}
        >
          {/* Image */}
          <img
            src={currentProfile.image}
            alt={currentProfile.name}
            className="w-full h-full object-cover"
          />
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Badges */}
          <div className="absolute top-4 left-4 flex gap-2">
            {currentProfile.verified && (
              <Badge className="bg-success text-white gap-1">
                <Sparkles className="w-3 h-3" /> Verificado
              </Badge>
            )}
            {currentProfile.premium && (
              <Badge className="bg-gold text-black gap-1">
                <Star className="w-3 h-3" /> Premium
              </Badge>
            )}
          </div>

          {/* Profile Info */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-bold text-white mb-1">
                  {currentProfile.name}, {currentProfile.age}
                </h2>
                <div className="flex items-center gap-1 text-white/80 mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>{currentProfile.city}</span>
                </div>
                <p className="text-white/90 text-sm line-clamp-2">
                  {currentProfile.bio}
                </p>
              </div>
            </div>
          </div>

          {/* Swipe Indicators */}
          {swipeDirection === 'right' && (
            <div className="absolute inset-0 flex items-center justify-center bg-success/20 animate-fade-in">
              <Heart className="w-32 h-32 text-success" fill="currentColor" />
            </div>
          )}
          {swipeDirection === 'left' && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 animate-fade-in">
              <X className="w-32 h-32 text-destructive" />
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-6 mt-6">
        <Button
          size="lg"
          variant="outline"
          className="w-16 h-16 rounded-full border-2 border-destructive text-destructive hover:bg-destructive hover:text-white transition-all"
          onClick={handlePass}
        >
          <X className="w-8 h-8" />
        </Button>

        <Button
          size="lg"
          className="w-20 h-20 rounded-full bg-gradient-primary shadow-glow hover:opacity-90 transition-all"
          onClick={handleLike}
        >
          <Heart className="w-10 h-10" fill="white" />
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="w-16 h-16 rounded-full border-2 border-gold text-gold hover:bg-gold hover:text-black transition-all"
        >
          <Star className="w-8 h-8" />
        </Button>
      </div>

      {/* Hint */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        Arraste para os lados ou use os botões
      </p>
    </div>
  );
}
