import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export const IDADE_MIN = 18;
export const IDADE_TETO = 70; // "70+": sem limite de cima

export type FaixaIdade = { min: number; max: number; ambos: boolean };
export const FAIXA_QUALQUER: FaixaIdade = { min: IDADE_MIN, max: IDADE_TETO, ambos: false };

export const faixaAtiva = (f: FaixaIdade) => f.min > IDADE_MIN || f.max < IDADE_TETO;

export function rotuloFaixa(f: FaixaIdade) {
  if (!faixaAtiva(f)) return 'Qualquer idade';
  if (f.max >= IDADE_TETO) return `${f.min}+ anos`;
  if (f.min <= IDADE_MIN) return `até ${f.max} anos`;
  return `${f.min} a ${f.max} anos`;
}

const ATALHOS: Array<[number, number]> = [[18, 25], [26, 35], [36, 45], [46, 70]];

/**
 * Faixa de idade "de X até Y". O deslizar só muda o rótulo; a busca roda quando
 * a pessoa solta o controle (onChange), para não disparar uma consulta por
 * pixel arrastado.
 */
export default function FiltroIdade({
  valor,
  onChange,
  className,
}: {
  valor: FaixaIdade;
  onChange: (f: FaixaIdade) => void;
  className?: string;
}) {
  const [rascunho, setRascunho] = useState<[number, number]>([valor.min, valor.max]);
  useEffect(() => { setRascunho([valor.min, valor.max]); }, [valor.min, valor.max]);
  const exibido: FaixaIdade = { ...valor, min: rascunho[0], max: rascunho[1] };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Idade</span>
        <span className={cn('text-sm font-bold', faixaAtiva(exibido) ? 'text-brand-pink' : 'text-muted-foreground')}>
          {rotuloFaixa(exibido)}
        </span>
      </div>
      <Slider
        min={IDADE_MIN}
        max={IDADE_TETO}
        step={1}
        minStepsBetweenThumbs={1}
        value={rascunho}
        onValueChange={(v) => setRascunho([v[0], v[1]] as [number, number])}
        onValueCommit={(v) => onChange({ ...valor, min: v[0], max: v[1] })}
        className="py-2"
        aria-label="Faixa de idade"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>18</span><span>70+</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ATALHOS.map(([a, b]) => {
          const ativo = valor.min === a && valor.max === b;
          return (
            <button
              key={`${a}-${b}`}
              type="button"
              onClick={() => onChange({ ...valor, min: a, max: b })}
              className={cn(
                'min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors',
                ativo ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {b >= IDADE_TETO ? `${a}+` : `${a}–${b}`}
            </button>
          );
        })}
        {faixaAtiva(valor) && (
          <button
            type="button"
            onClick={() => onChange({ ...FAIXA_QUALQUER, ambos: valor.ambos })}
            className="min-h-[36px] rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕ Qualquer
          </button>
        )}
      </div>
      <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={valor.ambos}
          onChange={(e) => onChange({ ...valor, ambos: e.target.checked })}
          className="h-4 w-4 accent-pink-500"
        />
        Em casal, os dois precisam estar na faixa
      </label>
    </div>
  );
}
