/**
 * ProfileGateContext
 *
 * Gate de completude de perfil — pede foto, idade, interesses e cidade
 * ANTES de o usuário executar ações que dependem desses dados para funcionar
 * bem (Match, Radar, Chat, Busca etc.), independente de ser premium ou não.
 *
 * Uso:
 *   const { requireFields } = useProfileGate();
 *
 *   const handleLike = async () => {
 *     const ok = await requireFields(['photo', 'birthDate', 'interests', 'city']);
 *     if (!ok) return; // usuário fechou o modal sem preencher
 *     // ... lógica da ação
 *   };
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CalendarDays, Camera, Check, ChevronRight,
  Heart, ImagePlus, MapPin, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CitySearch } from '@/components/CitySearch';
import { profileService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GateField = 'photo' | 'birthDate' | 'interests' | 'city';

interface ProfileGateContextValue {
  /**
   * Verifica quais dos `fields` estão faltando no perfil do usuário e, se
   * houver algum, exibe o modal de preenchimento passo a passo.
   * Resolve com `true` quando tudo estiver preenchido, `false` se o usuário
   * fechar o modal sem completar.
   */
  requireFields: (fields: GateField[]) => Promise<boolean>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ProfileGateContext = createContext<ProfileGateContextValue>({
  requireFields: async () => true,
});

export function useProfileGate() {
  return useContext(ProfileGateContext);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function parseDateParts(iso: string) {
  if (!iso) return { day: '', month: '', year: '' };
  const [y, m, d] = iso.split('-');
  return { day: d || '', month: m || '', year: y || '' };
}
function buildIso(day: string, month: string, year: string) {
  if (!day || !month || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function isMissing(user: any, field: GateField): boolean {
  switch (field) {
    case 'photo':     return !user?.avatar;
    case 'birthDate': return !user?.birthDate;
    case 'interests': return !user?.fetiches?.length || !user?.lookingFor?.length;
    case 'city':      return !user?.city;
  }
}

// ─── Step components ─────────────────────────────────────────────────────────

function BirthDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = parseDateParts(value);
  const [day, setDay]     = useState(parts.day);
  const [month, setMonth] = useState(parts.month);
  const [year, setYear]   = useState(parts.year);

  const maxYear = new Date().getFullYear() - 18;
  const years = Array.from({ length: maxYear - 1939 }, (_, i) => maxYear - i);
  const daysInMonth = month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleMonth = (m: string) => {
    setMonth(m);
    if (day && m && year) {
      const max = new Date(Number(year), Number(m), 0).getDate();
      if (Number(day) > max) setDay('');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange(buildIso(day, month, year)); }, [day, month, year]);

  const sel = 'flex-1 h-10 rounded-lg border border-input bg-background px-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-center';
  return (
    <div className="flex gap-2">
      <select value={day} onChange={(e) => setDay(e.target.value)} className={sel} aria-label="Dia">
        <option value="">Dia</option>
        {days.map((d) => <option key={d} value={String(d).padStart(2, '0')}>{d}</option>)}
      </select>
      <select value={month} onChange={(e) => handleMonth(e.target.value)} className={cn(sel, 'flex-[2]')} aria-label="Mês">
        <option value="">Mês</option>
        {MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <select value={year} onChange={(e) => setYear(e.target.value)} className={cn(sel, 'flex-[1.4]')} aria-label="Ano">
        <option value="">Ano</option>
        {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}

const AUDIENCE_OPTIONS = [
  { value: 'Mulher',            label: 'Mulher solteira',  emoji: '👩' },
  { value: 'Homem',             label: 'Homem solteiro',   emoji: '👨' },
  { value: 'Casal (Ele/Ela)',   label: 'Casal (Ele/Ela)',  emoji: '👫' },
  { value: 'Casal (Ele/Ele)',   label: 'Casal (Ele/Ele)',  emoji: '👬' },
  { value: 'Casal (Ela/Ela)',   label: 'Casal (Ela/Ela)',  emoji: '👭' },
  { value: 'Transexual',        label: 'Pessoa trans',     emoji: '🏳️‍⚧️' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser',     emoji: '✨' },
  { value: 'Travesti',          label: 'Travesti',         emoji: '🌟' },
];

const FETICHE_OPTIONS = [
  'Sexo anal', 'Dotado', 'Cuckold', 'Voyerismo', 'Orgia', 'Gang Bang',
  'Sexting', 'Podolatria', 'Inversão', 'Dogging', 'Dupla penetração',
  'Sexo virtual', 'Fisting', 'Dominação', 'Submissão', 'Bondage',
  'Sadismo', 'Masoquismo', 'BBW', 'Pregnofilia', 'Bukkake',
  'Beijo grego', 'Golden shower',
];

// Step: Photo
function PhotoStep({ onDone }: { onDone: () => void }) {
  const { updateUser } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Envie apenas imagens (JPG, PNG, WEBP).'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('Máximo 20 MB.'); return; }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const up = await profileService.uploadMedia(file, { isPrivate: false, source: 'profile' });
      const mediaId = up?.id ? String(up.id) : '';
      const url = up?.url ? String(up.url) : '';
      if (mediaId) await profileService.setMainPhoto(mediaId);
      if (url) updateUser({ avatar: resolveServerUrl(url) });
      setDone(true);
    } catch {
      setError('Erro ao enviar. Tente novamente.');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  if (done) return (
    <div className="flex flex-col items-center gap-4 py-2">
      {preview && <img src={preview} alt="Foto" className="h-20 w-20 rounded-full object-cover ring-4 ring-emerald-400/50" />}
      <p className="font-semibold text-emerald-600">Foto enviada! 🎉</p>
      <Button className="w-full bg-gradient-to-r from-primary to-violet-600" onClick={onDone}>
        Continuar <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition-all',
          uploading ? 'opacity-60 pointer-events-none' : 'border-border hover:border-primary/60 hover:bg-primary/4'
        )}
      >
        {preview
          ? <img src={preview} alt="Preview" className="h-16 w-16 rounded-full object-cover ring-4 ring-primary/30" />
          : <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><ImagePlus className="h-6 w-6 text-primary" /></div>
        }
        {uploading
          ? <div className="flex items-center gap-2 text-sm text-primary"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Enviando...</div>
          : <div><p className="text-sm font-semibold">Clique ou arraste sua foto</p><p className="text-xs text-muted-foreground">JPG, PNG ou WEBP · máx 20 MB</p></div>
        }
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
      <Button className="w-full bg-gradient-to-r from-primary to-violet-600" onClick={() => fileRef.current?.click()} disabled={uploading}>
        <Camera className="h-4 w-4 mr-2" />{uploading ? 'Enviando...' : 'Selecionar foto'}
      </Button>
    </div>
  );
}

// Step: BirthDate
function BirthDateStep({ onDone }: { onDone: () => void }) {
  const { updateUser } = useAuth();
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving]       = useState(false);

  const handleSave = async () => {
    if (!birthDate) return;
    setSaving(true);
    try {
      await profileService.updateProfile({ birthDate });
      updateUser({ birthDate });
      onDone();
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <BirthDatePicker value={birthDate} onChange={setBirthDate} />
      <Button className="w-full bg-gradient-to-r from-primary to-violet-600" onClick={handleSave} disabled={!birthDate || saving}>
        {saving ? 'Salvando...' : <>Confirmar <ChevronRight className="h-4 w-4 ml-1" /></>}
      </Button>
    </div>
  );
}

// Step: Interests
function InterestsStep({ onDone }: { onDone: () => void }) {
  const { user, updateUser } = useAuth();
  const [tab, setTab]           = useState<'lookingFor' | 'fetiches'>('lookingFor');
  const [lookingFor, setLookingFor] = useState<string[]>(user?.lookingFor || []);
  const [fetiches, setFetiches]     = useState<string[]>((user as any)?.fetiches || []);
  const [saving, setSaving]         = useState(false);

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {};
      if (lookingFor.length) payload.lookingFor = lookingFor;
      if (fetiches.length)   payload.fetiches   = fetiches;
      if (Object.keys(payload).length) {
        await profileService.updateProfile(payload);
        updateUser(payload);
      }
      onDone();
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex rounded-xl border overflow-hidden text-sm font-medium">
        <button type="button" onClick={() => setTab('lookingFor')}
          className={cn('flex-1 py-2 transition-colors', tab === 'lookingFor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary')}>
          {lookingFor.length === 0
            ? <span className="flex items-center justify-center gap-1">O que busca <span className="text-destructive text-[10px]">●</span></span>
            : `O que busca (${lookingFor.length})`}
        </button>
        <button type="button" onClick={() => setTab('fetiches')}
          className={cn('flex-1 py-2 transition-colors', tab === 'fetiches' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary')}>
          {fetiches.length === 0
            ? <span className="flex items-center justify-center gap-1">Fetiches <span className="text-destructive text-[10px]">●</span></span>
            : `Fetiches (${fetiches.length})`}
        </button>
      </div>

      {tab === 'lookingFor' && (
        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
          {AUDIENCE_OPTIONS.map((opt) => {
            const sel = lookingFor.includes(opt.value);
            return (
              <button key={opt.value} type="button" onClick={() => setLookingFor(toggle(lookingFor, opt.value))}
                className={cn('flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors',
                  sel ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/40')}>
                <span>{opt.emoji}</span><span className="truncate">{opt.label}</span>
                {sel && <Check className="ml-auto h-3 w-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      {tab === 'fetiches' && (
        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
          {FETICHE_OPTIONS.map((f) => {
            const sel = fetiches.includes(f);
            return (
              <button key={f} type="button" onClick={() => setFetiches(toggle(fetiches, f))}
                className={cn('flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors',
                  sel ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/40')}>
                <span className="truncate flex-1">{f}</span>
                {sel && <Check className="ml-auto h-3 w-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      {tab === 'lookingFor' && lookingFor.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">Selecione ao menos um perfil que você busca</p>
      )}
      {tab === 'fetiches' && fetiches.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">Selecione ao menos um fetiche</p>
      )}
      <Button className="w-full bg-gradient-to-r from-primary to-violet-600" onClick={handleSave} disabled={lookingFor.length === 0 || fetiches.length === 0 || saving}>
        {saving ? 'Salvando...' : <>Confirmar <ChevronRight className="h-4 w-4 ml-1" /></>}
      </Button>
    </div>
  );
}

// Step: City
function CityStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { updateUser } = useAuth();
  const [city, setCity]   = useState('');
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!city.trim()) return;
    setSaving(true);
    try {
      await profileService.updateProfile({ city: city.trim(), state: state.trim() || undefined });
      updateUser({ city: city.trim(), state: state.trim() || undefined });
      onDone();
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <CitySearch value={city} onChange={setCity} onSelect={(c, s) => { setCity(c); setState(s); }} placeholder="Digite sua cidade..." showLocate />
      <Button className="w-full bg-gradient-to-r from-primary to-violet-600" onClick={handleSave} disabled={!city.trim() || saving}>
        {saving ? 'Salvando...' : <><MapPin className="h-4 w-4 mr-2" />Confirmar cidade</>}
      </Button>
      <button type="button" onClick={onSkip} className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
        Pular por agora
      </button>
    </div>
  );
}

// ─── Step meta ────────────────────────────────────────────────────────────────

type StepMeta = { icon: typeof Camera; title: string; desc: string };

const STEP_META: Record<GateField, StepMeta> = {
  photo: {
    icon: Camera,
    title: 'Adicione uma foto',
    desc: 'Perfis com foto recebem 8× mais matches e aparecem nas buscas.',
  },
  birthDate: {
    icon: CalendarDays,
    title: 'Qual é sua idade?',
    desc: 'Sua idade aparece no seu perfil e ajuda a encontrar pessoas compatíveis.',
  },
  interests: {
    icon: Heart,
    title: 'O que você busca?',
    desc: 'Selecione seus interesses para aparecer nos resultados certos.',
  },
  city: {
    icon: MapPin,
    title: 'Onde você está?',
    desc: 'Informe sua cidade para aparecer nos resultados perto de você.',
  },
};

// ─── Gate modal ───────────────────────────────────────────────────────────────

interface GateModalProps {
  missingFields: GateField[];
  onComplete: () => void;
  onDismiss:  () => void;
}

function ProfileGateModal({ missingFields, onComplete, onDismiss }: GateModalProps) {
  const [index, setIndex] = useState(0);

  const advance = () => {
    if (index + 1 < missingFields.length) setIndex(index + 1);
    else onComplete();
  };

  const skip = () => {
    // Skip only allowed on 'city'; for others, dismiss means closing
    onDismiss();
  };

  const currentField = missingFields[index];
  const meta = STEP_META[currentField];
  const Icon = meta.icon;
  const pct = Math.round((index / missingFields.length) * 100);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onDismiss(); }}>
      <DialogContent className="max-w-sm w-full p-0 overflow-hidden rounded-2xl border-0">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-violet-600 via-primary to-rose-500 px-6 pt-7 pb-9 text-white">
          <button onClick={onDismiss} className="absolute top-3 right-3 rounded-full bg-white/20 p-1.5 text-white/80 hover:bg-white/30 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-3">
            {index > 0 && (
              <button onClick={() => setIndex(index - 1)} className="rounded-full bg-white/15 p-1 mr-1 hover:bg-white/25 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <span className="text-sm font-semibold text-white/90 uppercase tracking-wide">Complete seu perfil</span>
            <span className="ml-auto text-xs text-white/70">{index + 1} de {missingFields.length}</span>
          </div>
          <h2 className="text-xl font-bold mb-1">{meta.title}</h2>
          <p className="text-white/80 text-sm">{meta.desc}</p>
          <div className="mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-white/80 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="px-5 -mt-5 pb-6">
          <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
            </div>
            {currentField === 'photo'     && <PhotoStep     onDone={advance} />}
            {currentField === 'birthDate' && <BirthDateStep onDone={advance} />}
            {currentField === 'interests' && <InterestsStep onDone={advance} />}
            {currentField === 'city'      && <CityStep      onDone={advance} onSkip={skip} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProfileGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Holds the list of fields to show in the modal + the promise resolver
  const [missingFields, setMissingFields] = useState<GateField[] | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const requireFields = useCallback((fields: GateField[]): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!user) { resolve(false); return; }

      const missing = fields.filter((f) => isMissing(user, f));
      if (missing.length === 0) { resolve(true); return; }

      // Show the modal
      setMissingFields(missing);
      resolverRef.current = resolve;
    });
  }, [user]);

  const handleComplete = () => {
    setMissingFields(null);
    resolverRef.current?.(true);
    resolverRef.current = null;
  };

  const handleDismiss = () => {
    setMissingFields(null);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  return (
    <ProfileGateContext.Provider value={{ requireFields }}>
      {children}
      {missingFields && (
        <ProfileGateModal
          missingFields={missingFields}
          onComplete={handleComplete}
          onDismiss={handleDismiss}
        />
      )}
    </ProfileGateContext.Provider>
  );
}
