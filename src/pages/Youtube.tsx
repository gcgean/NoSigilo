import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { marcarPassoCadastro } from '@/services/api';

/**
 * Página do link da descrição do YouTube (nosigilo.net/youtube), 22/11/2026.
 * Precisa ser "limpa" (sem foto, sem nada sensual): o YouTube não aceita link
 * direto para conteúdo adulto. Diz o que é e leva ao cadastro com o perfil escolhido.
 * Mede: yt_abriu, yt_casal, yt_mulher, yt_homem. Origem no admin: "YouTube".
 */
const PERFIS = [
  { evento: 'yt_casal', perfil: 'Casal (Ele/Ela)', rotulo: 'Somos um casal', emoji: '👫' },
  { evento: 'yt_mulher', perfil: 'Mulher', rotulo: 'Sou mulher', emoji: '👩' },
  { evento: 'yt_homem', perfil: 'Homem', rotulo: 'Sou homem', emoji: '👨' },
] as const;

export default function Youtube() {
  const { user } = useAuth();
  useEffect(() => { marcarPassoCadastro('yt_abriu'); }, []);
  if (user) return <Navigate to="/feed" replace />;

  return (
    <main className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden bg-zinc-950 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-10 text-white">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(70%_50%_at_15%_10%,rgba(236,72,153,.45),transparent_60%),radial-gradient(70%_60%_at_95%_60%,rgba(168,85,247,.4),transparent_60%),radial-gradient(70%_45%_at_30%_100%,rgba(225,29,72,.45),transparent_60%)]" />
      <div className="relative mx-auto w-full max-w-md space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Comunidade liberal · Só para maiores de 18</p>
        <h1 className="text-[2rem] font-black leading-[1.1]">Se você se identificou com a história, você não está sozinho.</h1>
        <p className="text-base text-white/85">
          O NoSigilo é a comunidade liberal do Brasil: casais, mulheres e solteiros de mente aberta, que conversam,
          tiram dúvidas e se conhecem com respeito e total discrição.
        </p>
        <ul className="space-y-1.5 text-sm text-white/85">
          <li>🔒 Você entra com apelido. Ninguém sabe que é você.</li>
          <li>💬 Converse com casais experientes antes de dar qualquer passo.</li>
          <li>🔥 A Casa: festa liberal online, sexta e sábado às 22h.</li>
        </ul>
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
