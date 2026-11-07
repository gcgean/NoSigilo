import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { marcarPassoCadastro } from '@/services/api';

/**
 * Página do link do Instagram (nosigilo.net/vem): uma tela só, feita para o celular.
 * Diz o que é e leva direto ao cadastro, já com o perfil escolhido.
 * O resto a pessoa descobre lá dentro. Mede: ig_abriu, ig_casal, ig_mulher, ig_homem.
 */
const PERFIS = [
  { evento: 'ig_casal', perfil: 'Casal (Ele/Ela)', rotulo: 'Somos um casal', emoji: '👫' },
  { evento: 'ig_mulher', perfil: 'Mulher', rotulo: 'Sou mulher', emoji: '👩' },
  { evento: 'ig_homem', perfil: 'Homem', rotulo: 'Sou homem', emoji: '👨' },
] as const;

export default function Vem() {
  const { user } = useAuth();
  useEffect(() => { marcarPassoCadastro('ig_abriu'); }, []);
  if (user) return <Navigate to="/feed" replace />;

  return (
    <main className="relative flex min-h-[100dvh] flex-col justify-end overflow-hidden bg-zinc-950 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-10 text-white">
      <img src="/landing/masked-woman-722.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/55 to-black" />
      <div className="relative mx-auto w-full max-w-md space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Comunidade liberal · Só para maiores de 18</p>
        <h1 className="text-[2rem] font-black leading-[1.1]">O que parece proibido lá fora, aqui pode ser vivido.</h1>
        <p className="text-base text-white/85">Casais e singles em uma rede adulta, com discrição. Quem entra descobre o resto.</p>
        <p className="w-fit rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">🔥 A Casa, boate liberal online: sexta e sábado às 22h</p>
        <p className="pt-1 text-sm font-semibold">Quem vai entrar?</p>
        <div className="space-y-2.5">
          {PERFIS.map((p) => (
            <Link
              key={p.perfil}
              to={`/register?profile=${encodeURIComponent(p.perfil)}`}
              onClick={() => marcarPassoCadastro(p.evento)}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-fuchsia-600 text-lg font-bold active:scale-[0.98]"
            >
              <span aria-hidden="true">{p.emoji}</span> {p.rotulo}
            </Link>
          ))}
        </div>
        <p className="text-center text-xs text-white/65">Cadastro rápido · Perfil fora do Google</p>
        <p className="text-center text-sm">
          <Link to="/register" className="text-white/80 underline underline-offset-2">Outros perfis</Link>
          <span className="mx-2 text-white/40">·</span>
          <Link to="/login" className="text-white/80 underline underline-offset-2">Já tenho conta</Link>
        </p>
      </div>
    </main>
  );
}
