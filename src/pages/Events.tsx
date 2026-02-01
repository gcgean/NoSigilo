import { useState } from 'react';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Plus, 
  Clock, 
  Image as ImageIcon, 
  Sparkles,
  Send,
  Bell,
  Check,
  ChevronRight,
  Eye,
  Lock,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

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

const EVENT_TYPES = [
  { value: 'party', label: 'Festa', icon: '🎉' },
  { value: 'meetup', label: 'Encontro', icon: '👋' },
  { value: 'travel', label: 'Viagem', icon: '✈️' },
  { value: 'dinner', label: 'Jantar', icon: '🍷' },
  { value: 'club', label: 'Balada', icon: '🪩' },
  { value: 'beach', label: 'Praia', icon: '🏖️' },
  { value: 'private', label: 'Privado', icon: '🔒' },
];

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  eventType: string;
  image: string;
  attendees: number;
  maxAttendees: number;
  isGoing: boolean;
  isPremium?: boolean;
  isPrivate?: boolean;
  notificationsSent?: number;
  createdBy?: string;
}

const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Encontro em São Paulo',
    description: 'Um evento especial para conhecer pessoas da comunidade.',
    date: '2025-02-15',
    time: '20:00',
    location: 'São Paulo, SP',
    eventType: 'meetup',
    image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600',
    attendees: 45,
    maxAttendees: 100,
    isGoing: false,
  },
  {
    id: '2',
    title: 'Festa de Carnaval',
    description: 'A maior festa do ano está chegando! Venha celebrar conosco.',
    date: '2025-03-01',
    time: '22:00',
    location: 'Rio de Janeiro, RJ',
    eventType: 'party',
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600',
    attendees: 120,
    maxAttendees: 200,
    isGoing: true,
  },
  {
    id: '3',
    title: 'Happy Hour Premium',
    description: 'Evento exclusivo para membros premium. Drinks e networking.',
    date: '2025-02-20',
    time: '19:00',
    location: 'Belo Horizonte, MG',
    eventType: 'dinner',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600',
    attendees: 28,
    maxAttendees: 50,
    isGoing: false,
    isPremium: true,
  },
];

export default function Events() {
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>(mockEvents);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [step, setStep] = useState(1);
  
  // Form state
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    eventType: '',
    maxAttendees: 50,
    isPrivate: false,
  });
  
  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    targetCities: [] as string[],
    targetGender: ['all'] as string[],
    radius: [50],
    ageRange: [18, 50],
    onlyVerified: false,
    onlyPremium: false,
    customMessage: '',
  });

  const handleToggleAttendance = (eventId: string) => {
    setEvents(events.map(event => 
      event.id === eventId 
        ? { 
            ...event, 
            isGoing: !event.isGoing,
            attendees: event.isGoing ? event.attendees - 1 : event.attendees + 1
          }
        : event
    ));
  };

  const handleNextStep = () => {
    if (step === 1 && (!newEvent.title || !newEvent.date || !newEvent.location)) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: 'Título, data e local são obrigatórios',
        variant: 'destructive',
      });
      return;
    }
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setStep(step - 1);
  };

  const handleCreateEvent = async () => {
    // Calculate estimated reach
    const estimatedReach = notificationSettings.enabled 
      ? Math.floor(Math.random() * 500) + 100 
      : 0;

    const event: Event = {
      id: Date.now().toString(),
      title: newEvent.title,
      description: newEvent.description,
      date: newEvent.date,
      time: newEvent.time,
      location: newEvent.location,
      eventType: newEvent.eventType,
      image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600',
      attendees: 1,
      maxAttendees: newEvent.maxAttendees,
      isGoing: true,
      isPrivate: newEvent.isPrivate,
      notificationsSent: estimatedReach,
      createdBy: 'user-1',
    };

    setEvents([event, ...events]);
    
    toast({
      title: '🎉 Evento criado!',
      description: notificationSettings.enabled 
        ? `Notificações enviadas para ~${estimatedReach} pessoas` 
        : 'Seu evento foi criado com sucesso',
    });

    // Reset form
    setShowCreateDialog(false);
    setStep(1);
    setNewEvent({
      title: '',
      description: '',
      date: '',
      time: '',
      location: '',
      eventType: '',
      maxAttendees: 50,
      isPrivate: false,
    });
    setNotificationSettings({
      enabled: true,
      targetCities: [],
      targetGender: ['all'],
      radius: [50],
      ageRange: [18, 50],
      onlyVerified: false,
      onlyPremium: false,
      customMessage: '',
    });
  };

  const handleGenderToggle = (gender: string) => {
    if (gender === 'all') {
      setNotificationSettings(prev => ({ ...prev, targetGender: ['all'] }));
    } else {
      setNotificationSettings(prev => {
        const newGenders = prev.targetGender.filter(g => g !== 'all');
        if (newGenders.includes(gender)) {
          const filtered = newGenders.filter(g => g !== gender);
          return { ...prev, targetGender: filtered.length === 0 ? ['all'] : filtered };
        }
        return { ...prev, targetGender: [...newGenders, gender] };
      });
    }
  };

  const handleCityToggle = (cityState: string) => {
    setNotificationSettings(prev => {
      if (prev.targetCities.includes(cityState)) {
        return { ...prev, targetCities: prev.targetCities.filter(c => c !== cityState) };
      }
      return { ...prev, targetCities: [...prev.targetCities, cityState] };
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const getEventTypeIcon = (type: string) => {
    return EVENT_TYPES.find(t => t.value === type)?.icon || '📅';
  };

  return (
    <div className="max-w-4xl mx-auto md:ml-64">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Eventos</h1>
          <p className="text-muted-foreground">Encontros e festas da comunidade</p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setStep(1);
        }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary hover:opacity-90 gap-2">
              <Plus className="w-4 h-4" />
              Criar Evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {step === 1 && 'Criar Novo Evento'}
                {step === 2 && 'Configurar Notificações'}
                {step === 3 && 'Revisar e Publicar'}
              </DialogTitle>
            </DialogHeader>

            {/* Progress indicator */}
            <div className="flex items-center gap-2 mb-4">
              {[1, 2, 3].map((s) => (
                <div 
                  key={s}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    s <= step ? 'bg-primary' : 'bg-secondary'
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Event Details */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Evento</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {EVENT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setNewEvent({ ...newEvent, eventType: type.value })}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          newEvent.eventType === type.value
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <span className="text-2xl">{type.icon}</span>
                        <p className="text-xs mt-1">{type.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    placeholder="Nome do evento"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    placeholder="Descreva o evento e o que as pessoas podem esperar..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data *</Label>
                    <Input
                      type="date"
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={newEvent.time}
                      onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Local *</Label>
                  <Select 
                    value={newEvent.location} 
                    onValueChange={(v) => setNewEvent({ ...newEvent, location: v })}
                  >
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Máximo de participantes</Label>
                    <Input
                      type="number"
                      value={newEvent.maxAttendees}
                      onChange={(e) => setNewEvent({ ...newEvent, maxAttendees: parseInt(e.target.value) || 50 })}
                      min={2}
                      max={1000}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Visibilidade</Label>
                    <div className="flex items-center gap-2 h-10">
                      <Switch 
                        checked={newEvent.isPrivate}
                        onCheckedChange={(checked) => setNewEvent({ ...newEvent, isPrivate: checked })}
                      />
                      <span className="text-sm">
                        {newEvent.isPrivate ? (
                          <span className="flex items-center gap-1">
                            <Lock className="w-4 h-4" /> Privado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Globe className="w-4 h-4" /> Público
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Capa do Evento</Label>
                  <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors">
                    <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para adicionar imagem</p>
                  </div>
                </div>

                <Button onClick={handleNextStep} className="w-full">
                  Próximo: Configurar Notificações
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}

            {/* Step 2: Notification Settings */}
            {step === 2 && (
              <div className="space-y-4">
                <Card className="border-primary/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Bell className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Notificar pessoas</p>
                          <p className="text-sm text-muted-foreground">
                            Envie convites para pessoas compatíveis
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={notificationSettings.enabled}
                        onCheckedChange={(checked) => 
                          setNotificationSettings(prev => ({ ...prev, enabled: checked }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {notificationSettings.enabled && (
                  <>
                    {/* Target Cities */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Cidades para notificar
                      </Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Selecione as cidades de onde deseja atrair pessoas
                      </p>
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-secondary/50 rounded-lg">
                        {BRAZILIAN_CITIES.map((c) => {
                          const cityState = `${c.city}, ${c.state}`;
                          const isSelected = notificationSettings.targetCities.includes(cityState);
                          return (
                            <Badge
                              key={cityState}
                              variant={isSelected ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => handleCityToggle(cityState)}
                            >
                              {isSelected && <Check className="w-3 h-3 mr-1" />}
                              {c.city}
                            </Badge>
                          );
                        })}
                      </div>
                      {notificationSettings.targetCities.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma cidade selecionada = apenas cidade do evento
                        </p>
                      )}
                    </div>

                    {/* Target Gender */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Quem você quer convidar
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 'all', label: 'Todos' },
                          { value: 'female', label: 'Mulheres' },
                          { value: 'male', label: 'Homens' },
                          { value: 'couple', label: 'Casais' },
                        ].map((option) => (
                          <Badge
                            key={option.value}
                            variant={notificationSettings.targetGender.includes(option.value) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => handleGenderToggle(option.value)}
                          >
                            {notificationSettings.targetGender.includes(option.value) && (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            {option.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Radius */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Raio de alcance</Label>
                        <span className="text-sm text-muted-foreground">{notificationSettings.radius[0]} km</span>
                      </div>
                      <Slider
                        value={notificationSettings.radius}
                        onValueChange={(v) => setNotificationSettings(prev => ({ ...prev, radius: v }))}
                        max={200}
                        min={10}
                        step={10}
                      />
                    </div>

                    {/* Age Range */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Faixa etária</Label>
                        <span className="text-sm text-muted-foreground">
                          {notificationSettings.ageRange[0]} - {notificationSettings.ageRange[1]} anos
                        </span>
                      </div>
                      <Slider
                        value={notificationSettings.ageRange}
                        onValueChange={(v) => setNotificationSettings(prev => ({ ...prev, ageRange: v }))}
                        max={70}
                        min={18}
                        step={1}
                      />
                    </div>

                    {/* Filters */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Apenas verificados</Label>
                          <p className="text-xs text-muted-foreground">
                            Somente usuários com perfil verificado
                          </p>
                        </div>
                        <Switch 
                          checked={notificationSettings.onlyVerified}
                          onCheckedChange={(checked) => 
                            setNotificationSettings(prev => ({ ...prev, onlyVerified: checked }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Apenas premium</Label>
                          <p className="text-xs text-muted-foreground">
                            Somente assinantes premium
                          </p>
                        </div>
                        <Switch 
                          checked={notificationSettings.onlyPremium}
                          onCheckedChange={(checked) => 
                            setNotificationSettings(prev => ({ ...prev, onlyPremium: checked }))
                          }
                        />
                      </div>
                    </div>

                    {/* Custom Message */}
                    <div className="space-y-2">
                      <Label>Mensagem personalizada (opcional)</Label>
                      <Textarea
                        value={notificationSettings.customMessage}
                        onChange={(e) => 
                          setNotificationSettings(prev => ({ ...prev, customMessage: e.target.value }))
                        }
                        placeholder="Adicione uma mensagem especial para o convite..."
                        rows={2}
                        maxLength={150}
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {notificationSettings.customMessage.length}/150
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePrevStep} className="flex-1">
                    Voltar
                  </Button>
                  <Button onClick={handleNextStep} className="flex-1">
                    Revisar
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Event Preview */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getEventTypeIcon(newEvent.eventType)}</span>
                      <CardTitle className="text-lg">{newEvent.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {newEvent.description && (
                      <p className="text-muted-foreground">{newEvent.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(newEvent.date)} às {newEvent.time || '--:--'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>{newEvent.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>Máx. {newEvent.maxAttendees} pessoas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {newEvent.isPrivate ? (
                        <Badge variant="secondary">
                          <Lock className="w-3 h-3 mr-1" /> Privado
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Globe className="w-3 h-3 mr-1" /> Público
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Notification Summary */}
                {notificationSettings.enabled && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Send className="w-4 h-4 text-primary" />
                        Notificações
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                        <span>
                          Alcance estimado: <strong className="text-primary">~{Math.floor(Math.random() * 500) + 100}</strong> pessoas
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>
                          {notificationSettings.targetCities.length === 0 
                            ? 'Cidade do evento' 
                            : `${notificationSettings.targetCities.length} cidades`}
                          {' • '}{notificationSettings.radius[0]}km
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>
                          {notificationSettings.targetGender.includes('all') 
                            ? 'Todos' 
                            : notificationSettings.targetGender.join(', ')}
                          {' • '}{notificationSettings.ageRange[0]}-{notificationSettings.ageRange[1]} anos
                        </span>
                      </div>
                      {notificationSettings.customMessage && (
                        <div className="mt-2 p-2 bg-background rounded text-xs italic">
                          "{notificationSettings.customMessage}"
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePrevStep} className="flex-1">
                    Voltar
                  </Button>
                  <Button 
                    onClick={handleCreateEvent} 
                    className="flex-1 bg-gradient-primary"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Publicar Evento
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Events Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {events.map((event) => (
          <Card key={event.id} className="overflow-hidden glass group">
            {/* Event Image */}
            <div className="relative aspect-video">
              <img 
                src={event.image} 
                alt={event.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              
              {/* Type Icon */}
              <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center text-xl">
                {getEventTypeIcon(event.eventType)}
              </div>

              {/* Date Badge */}
              <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 text-center">
                <p className="text-xs text-muted-foreground">{formatDate(event.date).split(',')[0]}</p>
                <p className="text-xl font-bold">{new Date(event.date).getDate()}</p>
              </div>

              {/* Premium Badge */}
              {event.isPremium && (
                <Badge className="absolute bottom-4 left-4 bg-gold text-black gap-1">
                  <Sparkles className="w-3 h-3" /> Premium
                </Badge>
              )}

              {/* Notification sent indicator */}
              {event.notificationsSent && event.notificationsSent > 0 && (
                <Badge variant="secondary" className="absolute bottom-4 right-4 gap-1">
                  <Send className="w-3 h-3" /> {event.notificationsSent} notificados
                </Badge>
              )}
            </div>

            {/* Event Info */}
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {event.description}
              </p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{event.time}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{event.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{event.attendees}/{event.maxAttendees} confirmados</span>
                </div>
              </div>

              <Button
                onClick={() => handleToggleAttendance(event.id)}
                className={event.isGoing 
                  ? "w-full" 
                  : "w-full bg-gradient-primary hover:opacity-90"
                }
                variant={event.isGoing ? "outline" : "default"}
              >
                {event.isGoing ? 'Cancelar Presença' : 'Confirmar Presença'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {events.length === 0 && (
        <div className="text-center py-16 glass rounded-xl">
          <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhum evento encontrado</h3>
          <p className="text-muted-foreground mb-4">
            Seja o primeiro a criar um evento!
          </p>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-gradient-primary">
            Criar Evento
          </Button>
        </div>
      )}
    </div>
  );
}
