import { Lock, Globe, Users, Eye } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export type Visibility = 'public' | 'friends' | 'private';

interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  showPreview?: boolean;
}

const visibilityOptions = [
  {
    value: 'public' as Visibility,
    label: 'Público',
    description: 'Todos podem ver',
    icon: Globe,
  },
  {
    value: 'friends' as Visibility,
    label: 'Apenas Amigos',
    description: 'Somente seus amigos',
    icon: Users,
  },
  {
    value: 'private' as Visibility,
    label: 'Privado',
    description: 'Somente você',
    icon: Lock,
  },
];

export default function VisibilitySelector({
  value,
  onChange,
  showPreview = false,
}: VisibilitySelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        Visibilidade
      </Label>
      
      <RadioGroup value={value} onValueChange={(v) => onChange(v as Visibility)}>
        <div className="grid gap-2">
          {visibilityOptions.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                value === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              )}
            >
              <RadioGroupItem value={option.value} id={option.value} className="sr-only" />
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  value === option.value ? "bg-primary/20" : "bg-secondary"
                )}
              >
                <option.icon
                  className={cn(
                    "w-5 h-5",
                    value === option.value ? "text-primary" : "text-muted-foreground"
                  )}
                />
              </div>
              <div className="flex-1">
                <p className="font-medium">{option.label}</p>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </label>
          ))}
        </div>
      </RadioGroup>

      {showPreview && (
        <p className="text-xs text-muted-foreground">
          {value === 'public' && 'Este conteúdo será visível para todos os usuários da plataforma.'}
          {value === 'friends' && 'Este conteúdo será visível apenas para pessoas que você adicionou como amigo.'}
          {value === 'private' && 'Este conteúdo ficará oculto. Somente você poderá vê-lo.'}
        </p>
      )}
    </div>
  );
}
