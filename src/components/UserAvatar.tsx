import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveServerUrl } from "@/utils/serverUrl";

interface UserAvatarProps {
  user?: {
    name?: string;
    avatar?: string | null;
    isOnline?: boolean;
  };
  className?: string;
  indicatorClassName?: string;
}

export function UserAvatar({ user, className, indicatorClassName }: UserAvatarProps) {
  return (
    <div className="relative inline-block">
      <Avatar className={className}>
        <AvatarImage src={user?.avatar ? resolveServerUrl(user.avatar) : undefined} />
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
