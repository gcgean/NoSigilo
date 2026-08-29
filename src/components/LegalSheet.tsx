import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

/**
 * Termos, Privacidade e Diretrizes num bottom sheet.
 *
 * No cadastro esses links navegavam na mesma aba: o wizard desmontava e, na
 * volta, o usuário reiniciava no Passo 1 sem os dados. Aqui o documento abre
 * por cima, sem tirar ninguém do fluxo.
 *
 * Os corpos vêm por import dinâmico para não entrarem no bundle de quem
 * nunca abre o sheet.
 */
export type LegalDoc = 'terms' | 'privacy' | 'guidelines';

const TermsBody = lazy(() =>
  import('@/pages/Terms').then((m) => ({ default: m.TermsBody }))
);
const PrivacyBody = lazy(() =>
  import('@/pages/Privacy').then((m) => ({ default: m.PrivacyBody }))
);
const GuidelinesBody = lazy(() =>
  import('@/pages/Guidelines').then((m) => ({ default: m.GuidelinesBody }))
);

const DOCS: Record<LegalDoc, { titulo: string; descricao: string }> = {
  terms: { titulo: 'Termos de Uso', descricao: 'Regras de uso da plataforma.' },
  privacy: { titulo: 'Política de Privacidade', descricao: 'Como tratamos seus dados.' },
  guidelines: {
    titulo: 'Diretrizes da Comunidade',
    descricao: 'Segurança, discrição, respeito e consentimento.',
  },
};

type LegalSheetProps = {
  doc: LegalDoc | null;
  onClose: () => void;
};

export default function LegalSheet({ doc, onClose }: LegalSheetProps) {
  const meta = doc ? DOCS[doc] : null;

  return (
    <Sheet open={Boolean(doc)} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <SheetContent
        side="bottom"
        className="flex max-h-[88svh] flex-col gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b px-4 py-4 text-left">
          <SheetTitle>{meta?.titulo ?? ''}</SheetTitle>
          <SheetDescription>{meta?.descricao ?? ''}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 [&_.glass]:bg-transparent [&_.glass]:p-0 [&_.glass]:shadow-none">
          <Suspense
            fallback={
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {doc === 'terms' ? <TermsBody /> : null}
            {doc === 'privacy' ? <PrivacyBody /> : null}
            {doc === 'guidelines' ? <GuidelinesBody /> : null}
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  );
}
