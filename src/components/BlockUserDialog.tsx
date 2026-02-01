import { useState } from 'react';
import { Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface BlockUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onBlocked?: () => void;
}

export default function BlockUserDialog({
  isOpen,
  onClose,
  userId,
  userName,
  onBlocked,
}: BlockUserDialogProps) {
  const [isBlocking, setIsBlocking] = useState(false);
  const { toast } = useToast();

  const handleBlock = async () => {
    setIsBlocking(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    toast({
      title: 'Usuário bloqueado',
      description: `${userName} foi bloqueado. Você não receberá mais mensagens ou interações desta pessoa.`,
    });

    setIsBlocking(false);
    onBlocked?.();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-destructive" />
            Bloquear {userName}?
          </DialogTitle>
          <DialogDescription>
            Ao bloquear este usuário:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <span>Ele não poderá ver seu perfil ou fotos</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <span>Vocês não poderão trocar mensagens</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <span>Você não aparecerá nos resultados de busca dele</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <span>Esta ação pode ser desfeita nas configurações</span>
            </li>
          </ul>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleBlock}
              disabled={isBlocking}
              variant="destructive"
              className="flex-1"
            >
              {isBlocking ? 'Bloqueando...' : 'Bloquear'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
