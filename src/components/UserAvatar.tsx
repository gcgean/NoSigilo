import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveServerUrl, urlMiniatura } from "@/utils/serverUrl";

interface UserAvatarProps {
  user?: {
    name?: string;
    avatar?: string | null;
    isOnline?: boolean;
  };
  className?: string;
  indicatorClassName?: string;
  /**
   * Largura da miniatura pedida ao servidor. Padrão 240px (avatar redondo em
   * tela 2x); cartão grande da Busca pede 480. Evita baixar a foto cheia.
   */
  largura?: 120 | 240 | 360 | 480;
}

export function UserAvatar({ user, className, indicatorClassName, largura = 240 }: UserAvatarProps) {
  return (
    <div className="relative inline-block">
      <Avatar className={className}>
        <AvatarImage src={user?.avatar ? urlMiniatura(resolveServerUrl(user.avatar), largura) : undefined} />
        <AvatarFallback>{user?.name?.[0] || 'U'}</AvatarFallback>
      </Avatar>
      {user?.isOnline && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-white",
            indicatorClassName
          )} 
          title="Online"
        />
      )}
    </div>
  );
}
