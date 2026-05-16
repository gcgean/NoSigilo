/**
 * MediaWatermark — overlaid on top of sensitive media (images/videos).
 *
 * Renders the viewer's ID + username repeated diagonally across the content.
 * This makes every screenshot traceable back to the account that captured it.
 *
 * The overlay is:
 * - pointer-events: none  → doesn't block interaction
 * - user-select: none     → can't be selected/copied
 * - low opacity           → visible on screenshot but subtle during normal viewing
 */

interface MediaWatermarkProps {
  userId?: string | null;
  userName?: string | null;
  /** Extra className for the overlay wrapper */
  className?: string;
}

export default function MediaWatermark({ userId, userName, className }: MediaWatermarkProps) {
  if (!userId && !userName) return null;

  const label = [userName?.slice(0, 18), userId ? `#${String(userId).slice(-6)}` : '']
    .filter(Boolean)
    .join(' ');

  // Repeat the label enough times to fill any aspect ratio
  const rows = Array.from({ length: 8 });
  const cols = Array.from({ length: 4 });

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none z-10 ${className ?? ''}`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {rows.map((_, r) =>
        cols.map((_, c) => (
          <span
            key={`${r}-${c}`}
            className="absolute whitespace-nowrap text-[10px] font-medium text-white/18 dark:text-white/14"
            style={{
              top: `${r * 14 - 5}%`,
              left: `${c * 28 - 5}%`,
              transform: 'rotate(-30deg)',
              transformOrigin: 'top left',
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </span>
        ))
      )}
    </div>
  );
}
