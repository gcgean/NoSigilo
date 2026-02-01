import { useState } from 'react';
import { Flag, Ban, AlertTriangle, X } from 'lucide-react';
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

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: 'Selecione um motivo',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    toast({
      title: 'Denúncia enviada',
      description: 'Nossa equipe irá analisar o conteúdo reportado.',
    });

    setIsSubmitting(false);
    setReason('');
    setDetails('');
    onClose();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
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
            <Label>Motivo da denúncia</Label>
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
            <Label htmlFor="details">Detalhes adicionais (opcional)</Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Forneça mais informações sobre o problema..."
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !reason}
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
