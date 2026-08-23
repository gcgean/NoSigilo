import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { reportsService } from '@/services/api';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'user' | 'post' | 'photo' | 'message';
  targetId: string;
  targetName?: string;
}

const reportReasons = [
  { id: 'spam', label: 'Spam ou conteúdo enganoso' },
  { id: 'harassment', label: 'Assédio ou bullying' },
  { id: 'inappropriate', label: 'Conteúdo inapropriado' },
  { id: 'underage', label: 'Conteúdo de menor de idade' },
  { id: 'fake', label: 'Perfil falso ou impostor' },
  { id: 'other', label: 'Outro motivo' },
];

export default function ReportDialog({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
}: ReportDialogProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // "Outro motivo" sozinho nao diz nada ao moderador — nesse caso a explicacao
  // passa a fazer parte do motivo obrigatorio.
  const precisaDetalhar = reason === 'other';
  const detalhesOk = !precisaDetalhar || details.trim().length >= 5;
  const podeEnviar = Boolean(reason) && detalhesOk;

  // Limpa o formulario ao fechar, para o proximo alvo nao herdar o motivo antigo.
  const handleClose = () => {
    setReason('');
    setDetails('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: 'Selecione um motivo',
        description: 'O motivo da denúncia é obrigatório.',
        variant: 'destructive',
      });
      return;
    }
    if (!detalhesOk) {
      toast({
        title: 'Descreva o motivo',
        description: 'Ao escolher "Outro motivo", explique o que aconteceu.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await reportsService.submit({
        targetType,
        targetId,
        targetName,
        reason,
        details: details.trim() || undefined,
      });
      toast({
        title: 'Denúncia enviada',
        description: 'Nossa equipe irá analisar o conteúdo reportado.',
      });
      setReason('');
      setDetails('');
      onClose();
    } catch {
      toast({
        title: 'Erro ao enviar denúncia',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (targetType) {
      case 'user':
        return `Denunciar ${targetName || 'usuário'}`;
      case 'post':
        return 'Denunciar publicação';
      case 'photo':
        return 'Denunciar foto';
      case 'message':
        return 'Denunciar mensagem';
      default:
        return 'Denunciar';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-destructive" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            Por favor, nos diga o motivo da denúncia. Sua identidade será mantida em sigilo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-3">
            <Label>
              Motivo da denúncia <span className="text-destructive">*</span>
            </Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {reportReasons.map((r) => (
                <div key={r.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={r.id} id={r.id} />
                  <Label htmlFor={r.id} className="font-normal cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">
              {precisaDetalhar ? (
                <>Descreva o motivo <span className="text-destructive">*</span></>
              ) : (
                'Detalhes adicionais (opcional)'
              )}
            </Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={
                precisaDetalhar
                  ? 'Explique o que aconteceu para nossa equipe analisar...'
                  : 'Forneça mais informações sobre o problema...'
              }
              rows={3}
            />
            {precisaDetalhar && !detalhesOk ? (
              <p className="text-xs text-destructive">
                Explique o motivo em pelo menos 5 caracteres.
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !podeEnviar}
              className="flex-1 bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Denúncia'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
