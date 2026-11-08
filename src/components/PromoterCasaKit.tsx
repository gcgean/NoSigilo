import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import apiClient from '@/utils/apiClient';

type Encontro = { inicio: string; tema: { nome: string; descricao: string } };

export default function PromoterCasaKit({ link, copy }: { link: string; copy: (text: string) => Promise<void> }) {
  const [encontro, setEncontro] = useState<Encontro | null>(null);
  useEffect(() => {
    let ativo = true;
    apiClient.get('/casa').then(({ data }) => {
      if (ativo) setEncontro(data.proximoEncontro ?? null);
    }).catch(() => {});
    return () => { ativo = false; };
  }, []);

  const horario = encontro
    ? new Date(encontro.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const agenda = encontro && horario ? `${encontro.tema.nome} · ${horario} (Brasília).` : 'Confira o tema e o horário do próximo encontro.';
  const textos = [
    { titulo: 'Quinta · anuncie o encontro', texto: `Já tem encontro marcado n’A Casa! ${agenda} Confirme sua presença pelo meu convite.` },
    { titulo: 'Sexta · faça o convite', texto: `Bora se encontrar n’A Casa? ${agenda} Vai ter recepção no Salão, brincadeiras e interação nas salas. Vem pelo meu convite!` },
    { titulo: 'Na abertura · chame para entrar', texto: 'A Casa abriu! Vem agora para o Salão e conheça quem já chegou. Entre pelo meu convite.' },
  ];
  return <section className="space-y-3 rounded-2xl border border-primary/30 p-5">
    <h2 className="font-bold">Kit semanal d’A Casa</h2>
    <p className="text-sm text-muted-foreground">Combine os textos com as fotos e vídeos do acervo que têm destino A Casa. Cada texto inclui seu link individual.</p>
    {encontro && <p className="text-sm">{agenda} {encontro.tema.descricao}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      {textos.map(({ titulo, texto }) => <div key={titulo} className="space-y-2 rounded-xl border p-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-sm text-muted-foreground">{texto}</p>
        <Button variant="outline" disabled={!link} onClick={() => void copy(`${texto}\n${link}`)}>Copiar texto</Button>
      </div>)}
    </div>
  </section>;
}
