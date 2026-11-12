import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import SaibaMais from '@/components/SaibaMais';

type Props = {
  enabled: boolean;
  selected: string[];
  options: { value: string; label: string }[];
  onEnabledChange: (enabled: boolean) => void;
  onSelectionChange: (selected: string[]) => void;
};

export default function ContactProfileFilter({ enabled, selected, options, onEnabledChange, onSelectionChange }: Props) {
  return <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="font-semibold">Só alguns tipos de perfil podem puxar conversa</h3><p className="mt-1 text-sm text-muted-foreground">Desligado: qualquer tipo pode.</p></div>
      <Switch aria-label="Filtrar contatos por tipo de perfil" checked={enabled} onCheckedChange={onEnabledChange} />
    </div>
    {enabled ? <>
      <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm"><Checkbox checked={selected.includes(option.value)} onCheckedChange={(checked) => onSelectionChange(checked ? [...new Set([...selected, option.value])] : selected.filter((value) => value !== option.value))} /><span>{option.label}</span></label>)}</div>
      {!selected.length && <p className="text-sm text-destructive" role="alert">Selecione pelo menos um tipo de perfil para salvar o filtro.</p>}
    </> : null}
    {/* Textos longos viraram "Saiba mais" (12/11/2026). */}
    <SaibaMais resumo="Quem vocês curtiram ou responderam sempre pode falar com vocês.">
      {enabled
        ? <>Os tipos não marcados não podem iniciar contato e veem o aviso: “Este perfil recebe novos contatos apenas dos tipos de perfil selecionados nas preferências.” </>
        : <>Sem filtro por tipo, qualquer perfil pode pedir contato; use “Pedidos de contato” para decidir antes de liberar a conversa. </>}
      Esta escolha é independente de quem vocês procuram. Quem vocês curtiram (perfil ou conteúdo), chamaram ou responderam também pode entrar em contato, inclusive n’A Casa. Pedidos já aceitos continuam liberados. Uma curtida enviada só pela outra pessoa não libera. Bloqueios individuais e “Ninguém” continuam valendo.
    </SaibaMais>
  </div>;
}
