import { useState } from 'react';
import { MoreHorizontal, Flag, Ban, UserX, Share2, Heart, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ReportDialog from './ReportDialog';
import BlockUserDialog from './BlockUserDialog';

interface UserActionsMenuProps {
  userId: string;
  userName: string;
  showLike?: boolean;
  showVisit?: boolean;
  onLike?: () => void;
  onVisit?: () => void;
}

export default function UserActionsMenu({
  userId,
  userName,
  showLike = false,
  showVisit = false,
  onLike,
  onVisit,
}: UserActionsMenuProps) {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {showLike && (
            <DropdownMenuItem onClick={onLike}>
              <Heart className="w-4 h-4 mr-2" />
              Curtir
            </DropdownMenuItem>
          )}
          {showVisit && (
            <DropdownMenuItem onClick={onVisit}>
              <Eye className="w-4 h-4 mr-2" />
              Visitar Perfil
            </DropdownMenuItem>
          )}
          <DropdownMenuItem>
            <Share2 className="w-4 h-4 mr-2" />
            Compartilhar
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => setShowReportDialog(true)}
            className="text-warning focus:text-warning"
          >
            <Flag className="w-4 h-4 mr-2" />
            Denunciar
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => setShowBlockDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="w-4 h-4 mr-2" />
            Bloquear
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        targetType="user"
        targetId={userId}
        targetName={userName}
      />

      <BlockUserDialog
        isOpen={showBlockDialog}
        onClose={() => setShowBlockDialog(false)}
        userId={userId}
        userName={userName}
      />
    </>
  );
}
