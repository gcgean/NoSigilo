import React, { useState } from 'react';
import { 
  Radar as RadarIcon, 
  MapPin, 
  Send, 
  Users, 
  Clock, 
  Sparkles,
  Navigation,
  Search,
  Check,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface RadarBroadcast {
  id: string;
  city: string;
  state: string;
  message: string;
  targetGender: string[];
  radius: number;
  duration: number;
  sentAt: Date;
  viewsCount: number;
  responsesCount: number;
  isActive: boolean;
}

const BRAZILIAN_CITIES = [
  { city: 'São Paulo', state: 'SP' },
  { city: 'Rio de Janeiro', state: 'RJ' },
  { city: 'Fortaleza', state: 'CE' },
  { city: 'Salvador', state: 'BA' },
  { city: 'Belo Horizonte', state: 'MG' },
  { city: 'Recife', state: 'PE' },
  { city: 'Porto Alegre', state: 'RS' },
  { city: 'Curitiba', state: 'PR' },
  { city: 'Brasília', state: 'DF' },
  { city: 'Manaus', state: 'AM' },
  { city: 'Florianópolis', state: 'SC' },
  { city: 'Natal', state: 'RN' },
  { city: 'João Pessoa', state: 'PB' },
  { city: 'Maceió', state: 'AL' },
  { city: 'Vitória', state: 'ES' },
];

const MESSAGE_TEMPLATES = [
  "Estou de passagem pela cidade e adoraria conhecer pessoas interessantes! 😊",
  "Viajando a trabalho e com tempo livre para drinks e boas conversas 🍷",
  "Chegando na cidade esse fim de semana! Quem topa um rolê? 🎉",
  "Explorando a cidade e procurando companhia para descobrir lugares novos 🗺️",
];

export default function Radar() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedCity, setSelectedCity] = useState('');
  const [message, setMessage] = useState('');
  const [targetGender, setTargetGender] = useState<string[]>(['all']);
  const [radius, setRadius] = useState([25]);
  const [duration, setDuration] = useState('24');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showOnlyOnline, setShowOnlyOnline] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Mock active broadcasts
  const [broadcasts, setBroadcasts] = useState<RadarBroadcast[]>([
    {
      id: '1',
      city: 'Fortaleza',
      state: 'CE',
      message: 'Estou de passagem e procurando conhecer gente nova!',
      targetGender: ['female'],
      radius: 25,
      duration: 24,
      sentAt: new Date(Date.now() - 3600000),
      viewsCount: 47,
      responsesCount: 12,
      isActive: true,
    }
  ]);

  const handleSendBroadcast = async () => {
    if (!selectedCity || !message.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Selecione uma cidade e escreva uma mensagem',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const cityData = BRAZILIAN_CITIES.find(c => `${c.city}, ${c.state}` === selectedCity);
    
    const newBroadcast: RadarBroadcast = {
      id: Date.now().toString(),
      city: cityData?.city || '',
      state: cityData?.state || '',
      message,
      targetGender,
      radius: radius[0],
      duration: parseInt(duration),
      sentAt: new Date(),
      viewsCount: 0,
      responsesCount: 0,
      isActive: true,
    };

    setBroadcasts(prev => [newBroadcast, ...prev]);
    
    toast({
      title: '📡 Radar ativado!',
      description: `Sua mensagem está sendo enviada para pessoas em ${cityData?.city}`,
    });
    
    setMessage('');
    setSelectedCity('');
    setIsSending(false);
  };

  const handleDeactivateBroadcast = (id: string) => {
    setBroadcasts(prev => 
      prev.map(b => b.id === id ? { ...b, isActive: false } : b)
    );
    toast({
      title: 'Radar desativado',
      description: 'Sua mensagem não será mais exibida',
    });
  };

  const handleUseTemplate = (template: string) => {
    setMessage(template);
  };

  const handleGenderToggle = (gender: string) => {
    if (gender === 'all') {
      setTargetGender(['all']);
    } else {
      setTargetGender(prev => {
        const newGenders = prev.filter(g => g !== 'all');
        if (newGenders.includes(gender)) {
          const filtered = newGenders.filter(g => g !== gender);
          return filtered.length === 0 ? ['all'] : filtered;
        }
        return [...newGenders, gender];
      });
    }
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-hero p-8 text-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96">
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-8 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
            <div className="absolute inset-16 rounded-full border-2 border-primary/50 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
          </div>
        </div>
        
        <div className="relative z-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mb-4 shadow-glow">
            <Radio className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Radar de Viagem</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Viajando para uma nova cidade? Ative o radar e notifique automaticamente 
            pessoas compatíveis que você está por lá e quer conhecer gente nova!
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Create Broadcast */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Enviar Broadcast
            </CardTitle>
            <CardDescription>
              Sua mensagem será enviada para pessoas compatíveis na cidade
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* City Selection */}
            <div className="space-y-2">
              <Label>Cidade destino</Label>
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a cidade" />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_CITIES.map((c) => (
                    <SelectItem key={`${c.city}-${c.state}`} value={`${c.city}, ${c.state}`}>
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {c.city}, {c.state}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label>Sua mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva uma mensagem atraente..."
                className="min-h-[100px]"
                maxLength={200}
              />
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{message.length}/200</span>
                <button 
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => handleUseTemplate(MESSAGE_TEMPLATES[Math.floor(Math.random() * MESSAGE_TEMPLATES.length)])}
                >
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  Usar sugestão
                </button>
              </div>
            </div>

            {/* Quick Templates */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Templates rápidos</Label>
              <div className="flex flex-wrap gap-1">
                {MESSAGE_TEMPLATES.slice(0, 2).map((template, i) => (
                  <Badge 
                    key={i} 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-primary/20 text-xs"
                    onClick={() => handleUseTemplate(template)}
                  >
                    {template.slice(0, 30)}...
                  </Badge>
                ))}
              </div>
            </div>

            {/* Target Gender */}
            <div className="space-y-2">
              <Label>Quem você quer alcançar</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'female', label: 'Mulheres' },
                  { value: 'male', label: 'Homens' },
                  { value: 'couple', label: 'Casais' },
                ].map((option) => (
                  <Badge
                    key={option.value}
                    variant={targetGender.includes(option.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handleGenderToggle(option.value)}
                  >
                    {targetGender.includes(option.value) && <Check className="w-3 h-3 mr-1" />}
                    {option.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Radius */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Raio de alcance</Label>
                <span className="text-sm text-muted-foreground">{radius[0]} km</span>
              </div>
              <Slider
                value={radius}
                onValueChange={setRadius}
                max={100}
                min={5}
                step={5}
              />
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duração do broadcast</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 horas</SelectItem>
                  <SelectItem value="12">12 horas</SelectItem>
                  <SelectItem value="24">24 horas</SelectItem>
                  <SelectItem value="48">48 horas</SelectItem>
                  <SelectItem value="72">72 horas (3 dias)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Options */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Modo anônimo</Label>
                  <p className="text-xs text-muted-foreground">
                    Seu nome será revelado apenas se você responder
                  </p>
                </div>
                <Switch 
                  checked={isAnonymous} 
                  onCheckedChange={setIsAnonymous} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Apenas online</Label>
                  <p className="text-xs text-muted-foreground">
                    Enviar apenas para quem está online agora
                  </p>
                </div>
                <Switch 
                  checked={showOnlyOnline} 
                  onCheckedChange={setShowOnlyOnline} 
                />
              </div>
            </div>

            <Button 
              className="w-full mt-4" 
              size="lg"
              onClick={handleSendBroadcast}
              disabled={isSending || !selectedCity || !message.trim()}
            >
              {isSending ? (
                <>
                  <Radio className="w-4 h-4 animate-pulse" />
                  Ativando radar...
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  Ativar Radar
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Active Broadcasts */}
        <div className="space-y-4">
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Navigation className="w-5 h-5 text-primary" />
                Seus Radares Ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {broadcasts.filter(b => b.isActive).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum radar ativo</p>
                  <p className="text-sm">Ative um radar para começar a conhecer pessoas!</p>
                </div>
              ) : (
                broadcasts.filter(b => b.isActive).map((broadcast) => (
                  <div 
                    key={broadcast.id} 
                    className="p-4 rounded-lg bg-secondary/50 border border-border/50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <MapPin className="w-5 h-5 text-primary" />
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full animate-pulse" />
                        </div>
                        <div>
                          <p className="font-medium">{broadcast.city}, {broadcast.state}</p>
                          <p className="text-xs text-muted-foreground">
                            Ativo há {Math.floor((Date.now() - broadcast.sentAt.getTime()) / 3600000)}h
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeactivateBroadcast(broadcast.id)}
                      >
                        Desativar
                      </Button>
                    </div>
                    <p className="text-sm mb-3 line-clamp-2">{broadcast.message}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {broadcast.viewsCount} viram
                      </span>
                      <span className="flex items-center gap-1">
                        <Send className="w-4 h-4" />
                        {broadcast.responsesCount} responderam
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="glass border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="w-5 h-5 text-primary" />
                Dicas para mais respostas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span>Seja específico sobre o que você procura</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span>Mencione quanto tempo ficará na cidade</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span>Use fotos verificadas para mais credibilidade</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span>Ative o radar nos horários de pico (19h-23h)</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card className="glass">
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">
                    {broadcasts.reduce((acc, b) => acc + b.viewsCount, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Visualizações</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">
                    {broadcasts.reduce((acc, b) => acc + b.responsesCount, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Respostas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">
                    {broadcasts.filter(b => b.isActive).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Radares ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
