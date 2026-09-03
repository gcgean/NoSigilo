import { useState, useEffect } from 'react';
import { MapPin, Users, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CitySearch } from '@/components/CitySearch';
import { profileService, authService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Pede a cidade a quem ainda não informou. É BLOQUEANTE: sem cidade o app não
 * consegue fazer o que promete — feed por região, radar, busca por perto e a
 * ordenação regional dos stories dependem dela. Perfil sem cidade fica fora de
 * todos esses lugares, o que prejudica tanto quem não preencheu quanto quem
 * está por perto e nunca vê esse perfil.
 *
 * A versão anterior era pulável, e o "pular" ficava salvo no localStorage para
 * sempre — na prática a pessoa nunca mais era perguntada. Resultado: ~590
 * perfis sem cidade na base.
 *
 * Perfis vitrine/demo são a única exceção: são gerenciados pela administração
 * e não devem ser interrompidos por este modal.
 */

/** Mesma regra do backend (sanitizeCityValue): abaixo de 3 caracteres não é
 *  cidade. Cobre os registros com "F" e "S" que existem na base, vindos de um
 *  caminho de cadastro antigo — para eles o modal também aparece. */
function cidadeValida(valor?: string | null) {
  return String(valor ?? '').trim().length >= 3;
}

export default function CityRequiredModal() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);
  // Quem já tinha sessão salva antes desta mudança não tem isShowcase no
  // localStorage. Sem isto o modal bloquearia perfis vitrine até o cache
  // renovar — então, quando o campo vem indefinido, buscamos uma vez.
  const [showcaseResolvido, setShowcaseResolvido] = useState<boolean | null>(
    typeof user?.isShowcase === 'boolean' ? user.isShowcase : null
  );

  useEffect(() => {
    if (typeof user?.isShowcase === 'boolean') {
      setShowcaseResolvido(user.isShowcase);
      return;
    }
    if (!user?.id || cidadeValida(user?.city)) return;
    let cancelado = false;
    authService
      .getMe()
      .then((me: { isShowcase?: boolean } | null) => {
        if (cancelado) return;
        const vitrine = me?.isShowcase === true;
        setShowcaseResolvido(vitrine);
        updateUser({ isShowcase: vitrine });
      })
      .catch(() => {
        // Sem resposta, assume que não é vitrine: pedir a cidade a um perfil
        // vitrine por engano é menos grave do que deixar de pedir a um real.
        if (!cancelado) setShowcaseResolvido(false);
      });
    return () => { cancelado = true; };
  }, [user?.id, user?.isShowcase, user?.city, updateUser]);

  if (!user) return null;
  if (cidadeValida(user.city)) return null;
  if (showcaseResolvido !== false) return null; // vitrine, ou ainda resolvendo

  const salvar = async () => {
    const nome = city.trim();
    if (!cidadeValida(nome)) {
      toast({ title: 'Informe sua cidade', description: 'Digite pelo menos 3 letras ou escolha na lista.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await profileService.updateProfile({ city: nome, state: state.trim() || undefined });
      updateUser({ city: nome, state: state.trim() || undefined });
      toast({ title: '📍 Pronto!', description: 'Agora você vê e aparece para quem está por perto.' });
    } catch {
      toast({ title: 'Não foi possível salvar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cidade"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-background shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 id="titulo-cidade" className="text-xl font-bold">Qual é a sua cidade?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Precisamos dela para o app funcionar do jeito certo para você — e é
            rápido, leva 5 segundos.
          </p>
        </div>

        {/* O "porquê" explicado — pedir um dado sem justificar gera recusa. */}
        <div className="space-y-2.5 rounded-2xl bg-secondary/50 p-4">
          <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Seu feed passa a mostrar <strong className="text-foreground">quem está na sua região</strong>, em vez de perfis de outros estados.</span>
          </p>
          <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <Radar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Você <strong className="text-foreground">aparece para quem está por perto</strong> no radar e na busca — sem cidade, seu perfil fica de fora.</span>
          </p>
        </div>

        <CitySearch
          value={city}
          onChange={setCity}
          onSelect={(c, s) => { setCity(c); setState(s); }}
          placeholder="Digite sua cidade..."
          showLocate
        />

        <Button
          className="w-full gap-2 bg-gradient-to-r from-primary to-violet-600 text-white font-semibold"
          disabled={saving || !cidadeValida(city)}
          onClick={() => void salvar()}
        >
          {saving
            ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Salvando...</>
            : <><MapPin className="h-4 w-4" /> Confirmar cidade</>
          }
        </Button>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Só a cidade e o estado aparecem no seu perfil. Endereço, nunca.
          Você pode alterar quando quiser nas configurações.
        </p>
      </div>
    </div>
  );
}
