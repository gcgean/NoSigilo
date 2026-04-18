import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

type MobileStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
};

export default function MobileState({
  title,
  description,
  icon: Icon = Inbox,
  loading = false,
  className,
}: MobileStateProps) {
  return (
    <div
      className={cn(
        'glass flex min-h-[148px] flex-col items-center justify-center rounded-xl border border-border/60 px-5 py-7 text-center',
        className
      )}
    >
      {loading ? (
        <div className="mb-3 h-7 w-7 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
      ) : (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-[22rem] text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
