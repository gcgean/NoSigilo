import { useState, useEffect } from 'react';
import { MapPin, LocateFixed } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { locationService } from '@/services/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface CitySearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (city: string, state: string) => void;
  placeholder?: string;
  className?: string;
  showLocate?: boolean;
}

export function CitySearch({ value, onChange, onSelect, placeholder = 'Cidade...', className, showLocate = true }: CitySearchProps) {
  const [cityResults, setCityResults] = useState<Array<{ name: string; state: string }>>([]);
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const q = String(value || '').trim();
    if (q.length < 2) {
      setCityResults([]);
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        setIsCityLoading(true);
        const data = await locationService.getCities(q, 10);
        setCityResults(Array.isArray(data) ? data : []);
      } catch {
        setCityResults([]);
      } finally {
        setIsCityLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [value]);

  const handleUseLocation = async () => {
    if (!navigator.geolocation) {
      toast({ title: 'Localização indisponível', variant: 'destructive' });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const nearest = await locationService.getNearestCity(pos.coords.latitude, pos.coords.longitude);
          if (nearest?.name) {
            if (onSelect) {
              onSelect(nearest.name, nearest.state || '');
            } else {
              onChange(nearest.name);
            }
            setCityResults([]);
          }
        } catch {
          toast({ title: 'Não foi possível localizar', variant: 'destructive' });
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setIsLocating(false);
        toast({ title: 'Permissão negada', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9 pr-10"
        />
        {showLocate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleUseLocation}
            disabled={isLocating}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          >
            <LocateFixed className={cn('w-4 h-4', isLocating && 'animate-spin')} />
          </Button>
        )}
      </div>

      {isCityLoading && (
        <div className="absolute z-50 w-full mt-1 p-2 bg-card border rounded-lg shadow-lg">
          <p className="text-xs text-muted-foreground animate-pulse">Buscando...</p>
        </div>
      )}

      {!isCityLoading && cityResults.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {cityResults.map((c) => (
            <button
              type="button"
              key={`${c.name}-${c.state}`}
              className="w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors flex items-center justify-between"
              onClick={() => {
                if (onSelect) {
                  onSelect(c.name, c.state);
                } else {
                  onChange(c.name);
                }
                setCityResults([]);
              }}
            >
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.state}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
