import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CitySearch } from '@/components/CitySearch';
import { profileService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Modal bloqueante que obriga o usuário a informar a cidade.
 * Exibido quando user está logado mas não tem city preenchida.
 * Sem botão de fechar — é obrigatório para facilitar encontros por localização.
 */
export default function CityRequiredModal() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [city,    setCity]    = useState('');
  const [state,   setState]   = useState('');
  const [saving,  setSaving]  = useState(false);

  // Só renderiza se usuário logado sem cidade
  if (!user || user.city) return null;

  const handleSelect = (c: string, s: string) => {
    setCity(c);
    setState(s);
  };

  const handleSave = async () => {
    if (!city.trim()) {
      toast({ title: 'Selecione uma cidade', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await profileService.updateProfile({ city: city.trim(), state: state.trim() || undefined });
      updateUser({ city: city.trim(), state: state.trim() || undefined });
      toast({ title: '📍 Localização salva!', description: 'Agora você vai aparecer nos resultados perto de você.' });
    } catch {
      toast({ title: 'Erro ao salvar cidade', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-background shadow-2xl p-6 flex flex-col gap-5">
        {/* Ícone */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
        </div>

        {/* Texto */}
        <div className="text-center space-y-1.5">
          <h2 className="text-xl font-bold">Onde você está?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Informe sua cidade para aparecer nos resultados perto de você e encontrar pessoas na sua região.
          </p>
        </div>

        {/* Busca de cidade */}
        <CitySearch
          value={city}
          onChange={setCity}
          onSelect={handleSelect}
          placeholder="Digite sua cidade..."
          showLocate
        />

        {/* Botão confirmar */}
        <Button
          className="w-full gap-2 bg-gradient-to-r from-primary to-violet-600 text-white font-semibold"
          disabled={saving || !city.trim()}
          onClick={() => void handleSave()}
        >
          {saving
            ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Salvando...</>
            : <><MapPin className="h-4 w-4" /> Confirmar cidade</>
          }
        </Button>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Você pode atualizar a qualquer momento nas configurações.
        </p>
      </div>
    </div>
  );
}
