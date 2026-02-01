import { useState } from 'react';
import { Camera, Edit2, MapPin, Heart, Eye, Settings, Plus, Image, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

const mockPhotos = [
  { id: '1', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', isPrivate: false, isMain: true },
  { id: '2', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400', isPrivate: false, isMain: false },
  { id: '3', url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400', isPrivate: true, isMain: false },
];

export default function Profile() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('photos');

  // Mock user data for demo
  const profileData = {
    name: user?.name || 'Usuário',
    age: 28,
    city: 'São Paulo, SP',
    bio: 'Apaixonada por viagens, música e novas experiências. Buscando conexões verdadeiras e momentos especiais.',
    stats: {
      likes: 234,
      visits: 1203,
      matches: 47,
    },
    verified: true,
    premium: false,
  };

  return (
    <div className="max-w-2xl mx-auto md:ml-64">
      {/* Profile Header */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-primary/30 shadow-glow">
              <img
                src={mockPhotos[0].url}
                alt={profileData.name}
                className="w-full h-full object-cover"
              />
            </div>
            <button className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow">
              <Camera className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <h1 className="text-2xl font-bold">{profileData.name}, {profileData.age}</h1>
              {profileData.verified && (
                <Badge className="bg-success text-white gap-1">
                  <Sparkles className="w-3 h-3" /> Verificado
                </Badge>
              )}
            </div>
            
            <div className="flex items-center justify-center sm:justify-start gap-1 text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              <span>{profileData.city}</span>
            </div>

            <p className="text-muted-foreground text-sm mb-4">{profileData.bio}</p>

            <div className="flex items-center justify-center sm:justify-start gap-4">
              <Button variant="outline" size="sm" className="gap-2">
                <Edit2 className="w-4 h-4" />
                Editar Perfil
              </Button>
              <Button variant="ghost" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                Configurações
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Heart className="w-4 h-4" />
              <span className="text-2xl font-bold">{profileData.stats.likes}</span>
            </div>
            <p className="text-sm text-muted-foreground">Curtidas</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Eye className="w-4 h-4" />
              <span className="text-2xl font-bold">{profileData.stats.visits}</span>
            </div>
            <p className="text-sm text-muted-foreground">Visitas</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-2xl font-bold">{profileData.stats.matches}</span>
            </div>
            <p className="text-sm text-muted-foreground">Matches</p>
          </div>
        </div>
      </div>

      {/* Photos Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4">
          <TabsTrigger value="photos" className="flex-1 gap-2">
            <Image className="w-4 h-4" />
            Públicas
          </TabsTrigger>
          <TabsTrigger value="private" className="flex-1 gap-2">
            <Lock className="w-4 h-4" />
            Privadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos">
          <div className="grid grid-cols-3 gap-3">
            {mockPhotos.filter(p => !p.isPrivate).map((photo) => (
              <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group">
                <img src={photo.url} alt="" className="w-full h-full object-cover" />
                {photo.isMain && (
                  <Badge className="absolute top-2 left-2 bg-gradient-primary">Principal</Badge>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="icon" variant="ghost" className="text-white">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {/* Add Photo Button */}
            <button className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors">
              <Plus className="w-8 h-8" />
              <span className="text-sm">Adicionar</span>
            </button>
          </div>
        </TabsContent>

        <TabsContent value="private">
          <div className="glass rounded-xl p-8 text-center">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Fotos Privadas</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Suas fotos privadas só são visíveis para quem você autorizar.
            </p>
            <Button className="bg-gradient-primary hover:opacity-90 gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Foto Privada
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Premium Upsell */}
      {!profileData.premium && (
        <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-gold/20 to-primary/20 border border-gold/30">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gold flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-black" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Seja Premium</h3>
              <p className="text-sm text-muted-foreground">
                Desbloqueie recursos exclusivos e destaque seu perfil
              </p>
            </div>
            <Button className="bg-gold text-black hover:bg-gold/90">
              Ver Planos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
