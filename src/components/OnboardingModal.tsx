import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, CalendarDays, Heart, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { profileService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'nosigilo:onboarding-done';

const FETICHE_OPTIONS = [
  'Sexo anal', 'Dotado', 'Cuckold', 'Voyerismo', 'Orgia', 'Gang Bang',
  'Sexting', 'Podolatria', 'Inversão', 'Dogging', 'Dupla penetração',
  'Sexo virtual', 'Fisting', 'Dominação', 'Submissão', 'Bondage',
  'Sadismo', 'Masoquismo', 'BBW', 'Pregnofilia', 'Bukkake',
  'Beijo grego', 'Golden shower',
];

const AUDIENCE_OPTIONS = [
  { value: 'Mulher',            label: 'Mulher solteira',    emoji: '👩' },
  { value: 'Homem',             label: 'Homem solteiro',     emoji: '👨' },
  { value: 'Casal (Ele/Ela)',   label: 'Casal (Ele/Ela)',    emoji: '👫' },
  { value: 'Casal (Ele/Ele)',   label: 'Casal (Ele/Ele)',    emoji: '👬' },
  { value: 'Casal (Ela/Ela)',   label: 'Casal (Ela/Ela)',    emoji: '👭' },
  { value: 'Transexual',        label: 'Pessoa trans',       emoji: '🏳️‍⚧️' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)',  emoji: '✨' },
  { value: 'Travesti',          label: 'Travesti',           emoji: '🌟' },
];

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function needsOnboarding(user: any): boolean {
  if (!user) return false;
  if (user.isAdmin) return false;
  return !user.birthDate || !user.fetiches?.length || !user.lookingFor?.length;
}

function isCoupleProfile(gender?: string | null) {
  return String(gender || '').trim().startsWith('Casal');
}

function getCoupleLabels(gender?: string | null): [string, string] {
  const match = String(gender || '').match(/Casal\s*\(([^/]+)\/([^)]+)\)/);
  if (!match) return ['Pessoa 1', 'Pessoa 2'];
  const p1 = match[1].trim();
  const p2 = match[2].trim();
  if (p1 === p2) return [`${p1} (1)`, `${p2} (2)`];
  return [p1, p2];
}

/** Converte "YYYY-MM-DD" → { day, month, year } strings */
function parseDateParts(iso: string) {
  if (!iso) return { day: '', month: '', year: '' };
  const [y, m, d] = iso.split('-');
  return { day: d || '', month: m || '', year: y || '' };
}

/** Combina partes em "YYYY-MM-DD" ou '' se incompleto */
function buildIso(day: string, month: string, year: string) {
  if (!day || !month || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// ── Picker de data com 3 selects ──────────────────────────────────────
function BirthDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const parts = parseDateParts(value);
  const [day,   setDay]   = useState(parts.day);
  const [month, setMonth] = useState(parts.month);
  const [year,  setYear]  = useState(parts.year);

  const maxYear = new Date().getFullYear() - 18;
  const years   = Array.from({ length: maxYear - 1939 }, (_, i) => maxYear - i);

  const daysInMonth = month && year
    ? new Date(Number(year), Number(month), 0).getDate()
    : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Quando muda mês/ano e o dia escolhido é inválido, reseta o dia
  const handleMonth = (m: string) => {
    setMonth(m);
    if (day && m && year) {
      const max = new Date(Number(year), Number(m), 0).getDate();
      if (Number(day) > max) setDay('');
    }
  };

  useEffect(() => {
    onChange(buildIso(day, month, year));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, month, year]);

  const sel = 'flex-1 h-11 rounded-lg border border-input bg-background px-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-center';

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className={sel}
          aria-label="Dia"
        >
          <option value="">Dia</option>
          {days.map((d) => (
            <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
          ))}
        </select>

        <select
          value={month}
          onChange={(e) => handleMonth(e.target.value)}
          className={cn(sel, 'flex-[2]')}
          aria-label="Mês"
        >
          <option value="">Mês</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className={cn(sel, 'flex-[1.4]')}
          aria-label="Ano"
        >
          <option value="">Ano</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────
export default function OnboardingModal() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const [visible, setVisible] = useState(false);
  const [step,    setStep]    = useState(0);
  const [saving,  setSaving]  = useState(false);

  const isCouple = isCoupleProfile(user?.gender);
  const [coupleLabel1, coupleLabel2] = getCoupleLabels(user?.gender);

  const [birthDate,        setBirthDate]        = useState(user?.birthDate || '');
  const [partnerBirthDate, setPartnerBirthDate] = useState((user as any)?.partnerBirthDate || '');
  const [lookingFor,       setLookingFor]       = useState<string[]>(user?.lookingFor || []);
  const [fetiches,         setFetiches]         = useState<string[]>((user as any)?.fetiches || []);

  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === user.id) return;
    } catch {}
    if (needsOnboarding(user)) setVisible(true);
  }, [user?.id]);

  // Limpa travas de scroll/pointer-events deixadas por Radix Dialog após navegação SPA
  useEffect(() => {
    if (!visible) return;
    const cleanup = () => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
      document.documentElement.style.overflow = '';
      document.body.removeAttribute('data-scroll-locked');
    };
    cleanup();
    const t = setTimeout(cleanup, 100);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible || !user) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, user.id); } catch {}
    setVisible(false);
  };

  const totalSteps = 3;

  const toggleLookingFor = (val: string) =>
    setLookingFor((prev) => prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]);

  const toggleFetiche = (val: string) =>
    setFetiches((prev) => prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]);

  const handleFinish = async () => {
    setSaving(true);
    try {
      const payload: any = {};
      if (birthDate)                      payload.birthDate        = birthDate;
      if (isCouple && partnerBirthDate)   payload.partnerBirthDate = partnerBirthDate;
      if (lookingFor.length > 0)          payload.lookingFor       = lookingFor;
      if (fetiches.length > 0)            payload.fetiches         = fetiches;

      if (Object.keys(payload).length > 0) {
        await profileService.updateProfile(payload);
        await updateUser(payload);
      }
      toast({ title: '🎉 Perfil atualizado!', description: 'Seus interesses foram salvos.' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
      dismiss();
    }
  };

  // Avançar é sempre permitido — os campos são incentivados mas não obrigatórios
  const canAdvanceStep0 = true;
  const canAdvanceStep1 = true;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80"
      style={{ WebkitOverflowScrolling: 'auto' }}
    >
      <div className="w-full max-w-md rounded-3xl border border-primary/20 bg-background shadow-2xl overflow-hidden">
        {/* Gradient top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-violet-500 to-rose-500" />

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-5 pb-0">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-primary' : i < step ? 'w-3 bg-primary/40' : 'w-3 bg-border'
              )}
            />
          ))}
        </div>

        <div className="p-6 space-y-5">

          {/* ── STEP 0: Idade ── */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="flex justify-center mb-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <CalendarDays className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-bold">Qual sua idade?</h2>
                <p className="text-sm text-muted-foreground">
                  Sua idade aparecerá ao lado do seu nome nas buscas e no Match — ajuda a encontrar perfis compatíveis.
                </p>
              </div>

              <div className="space-y-3">
                <BirthDatePicker
                  label={isCouple ? `Nascimento — ${coupleLabel1}` : 'Data de nascimento'}
                  value={birthDate}
                  onChange={setBirthDate}
                />
                {isCouple && (
                  <BirthDatePicker
                    label={`Nascimento — ${coupleLabel2}`}
                    value={partnerBirthDate}
                    onChange={setPartnerBirthDate}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── STEP 1: O que busca ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="flex justify-center mb-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Heart className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-bold">O que você busca?</h2>
                <p className="text-sm text-muted-foreground">
                  Selecione os perfis que deseja encontrar. Usamos isso para mostrar você para quem está buscando o mesmo.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {AUDIENCE_OPTIONS.map((opt) => {
                  const selected = lookingFor.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleLookingFor(opt.value)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:border-primary/40'
                      )}
                    >
                      <span>{opt.emoji}</span>
                      <span className="truncate text-xs">{opt.label}</span>
                      {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
              {lookingFor.length > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  {lookingFor.length} selecionado(s)
                </p>
              )}
            </div>
          )}

          {/* ── STEP 2: Fetiches ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="flex justify-center mb-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Zap className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-bold">Seus fetiches</h2>
                <p className="text-sm text-muted-foreground">
                  Ajuda a encontrar perfis com interesses em comum. Você pode alterar isso a qualquer hora nas Configurações.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {FETICHE_OPTIONS.map((f) => {
                  const selected = fetiches.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleFetiche(f)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:border-primary/40'
                      )}
                    >
                      <span className="truncate flex-1">{f}</span>
                      {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
              {fetiches.length > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  {fetiches.length} selecionado(s)
                </p>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={dismiss}>
                Pular
              </Button>
            )}

            {step < totalSteps - 1 ? (
              <Button
                size="sm"
                className="gap-1 bg-gradient-to-r from-primary to-violet-600"
                onClick={() => setStep((s) => s + 1)}
                disabled={(step === 0 && !canAdvanceStep0) || (step === 1 && !canAdvanceStep1)}
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1 bg-gradient-to-r from-primary to-violet-600"
                onClick={handleFinish}
                disabled={saving}
              >
                <Sparkles className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Concluir'}
              </Button>
            )}
          </div>

          {/* Pular por agora — visível nos passos 1 e 2 (no passo 0 já existe o botão Pular à esquerda) */}
          {step > 0 && (
            <div className="text-center -mt-1">
              <button
                type="button"
                onClick={dismiss}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              >
                Pular por agora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
