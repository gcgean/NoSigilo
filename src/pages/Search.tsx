import { useState } from 'react';
import { Search, Filter, MapPin, Heart, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const mockResults = [
  {
    id: '1',
    name: 'Marina',
    age: 28,
    city: 'São Paulo',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
    verified: true,
    online: true,
  },
  {
    id: '2',
    name: 'Carolina',
    age: 25,
    city: 'Rio de Janeiro',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
    verified: true,
    online: false,
  },
  {
    id: '3',
    name: 'Julia',
    age: 30,
    city: 'Curitiba',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    verified: false,
    online: true,
  },
  {
    id: '4',
    name: 'Amanda',
    age: 27,
    city: 'Belo Horizonte',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
    verified: true,
    online: true,
  },
  {
    id: '5',
    name: 'Beatriz',
    age: 24,
    city: 'Porto Alegre',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
    verified: false,
    online: false,
  },
  {
    id: '6',
    name: 'Fernanda',
    age: 29,
    city: 'Salvador',
    image: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400',
    verified: true,
    online: true,
  },
];

export default function SearchPage() {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="max-w-4xl mx-auto md:ml-64">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Buscar</h1>
        <p className="text-muted-foreground">Encontre pessoas interessantes</p>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="w-4 h-4" />
          Filtros
        </Button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="glass rounded-xl p-4 mb-6 animate-slide-up">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Idade</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="18-25">18-25</SelectItem>
                  <SelectItem value="26-35">26-35</SelectItem>
                  <SelectItem value="36-45">36-45</SelectItem>
                  <SelectItem value="45+">45+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Cidade</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sp">São Paulo</SelectItem>
                  <SelectItem value="rj">Rio de Janeiro</SelectItem>
                  <SelectItem value="bh">Belo Horizonte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Status</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online agora</SelectItem>
                  <SelectItem value="verified">Verificados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full bg-gradient-primary hover:opacity-90">
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {mockResults.map((profile) => (
          <div
            key={profile.id}
            className="group relative rounded-2xl overflow-hidden cursor-pointer hover:shadow-glow transition-all"
          >
            <div className="aspect-[3/4]">
              <img
                src={profile.image}
                alt={profile.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

            {/* Online Indicator */}
            {profile.online && (
              <span className="absolute top-3 right-3 w-3 h-3 bg-success rounded-full ring-2 ring-background" />
            )}

            {/* Badges */}
            {profile.verified && (
              <Badge className="absolute top-3 left-3 bg-success/90 text-white gap-1">
                <Sparkles className="w-3 h-3" />
              </Badge>
            )}

            {/* Info */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-semibold text-lg">
                {profile.name}, {profile.age}
              </h3>
              <div className="flex items-center gap-1 text-white/70 text-sm">
                <MapPin className="w-3 h-3" />
                <span>{profile.city}</span>
              </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button size="icon" className="w-14 h-14 rounded-full bg-gradient-primary shadow-glow">
                <Heart className="w-6 h-6" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
