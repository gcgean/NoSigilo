import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Regras exibidas no composer, antes de publicar.
 *
 * Serve tanto para orientar quem publica quanto para registrar que o aviso
 * foi dado — o texto espelha as Diretrizes da Comunidade (src/pages/
 * Guidelines.tsx), então mudanças de regra devem andar juntas nos dois.
 *
 * O composer do NoSigilo vive dentro do feed (não numa página própria), por
 * isso o aviso aparece só quando alguém está de fato escrevendo: é o momento
 * em que ele importa, e assim não ocupa a dobra do feed o tempo todo.
 */
const PROIBIDO = [
  'Menores de idade (nem mesmo em contexto "não sexual").',
  'Crimes sexuais (zoofilia, pedofilia, estupro e afins).',
  'Conteúdo de terceiros sem consentimento.',
  'Venda de conteúdo (Privacy, OnlyFans e outros).',
  'Drogas, remédios ou armas.',
  'Publicidade de qualquer espécie.',
  'Prostituição ou sexo mediante pagamento.',
  'Oferta ou pedido de dinheiro ou "presentes".',
  'Números de telefone e outros contatos.',
];

export default function PostRulesNotice({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 ${className ?? ''}`}
      role="note"
      aria-label="Regras para publicar"
    >
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        Não são permitidas postagens com:
      </p>

      <ul className="ml-1 space-y-1 text-sm text-muted-foreground">
        {PROIBIDO.map((regra) => (
          <li key={regra} className="flex gap-2">
            <span aria-hidden="true" className="select-none">•</span>
            <span>{regra}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-sm text-muted-foreground">
        Você é responsável pelo conteúdo que publica. Postagens com qualquer um
        dos itens acima serão excluídas e sua conta poderá ser banida. Em casos
        extremos, as autoridades serão notificadas. Veja as{' '}
        <Link to="/guidelines" className="font-medium text-brand-pink hover:underline">
          Diretrizes da Comunidade
        </Link>
        .
      </p>
    </div>
  );
}
