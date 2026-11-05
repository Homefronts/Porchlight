import { cn } from "@/lib/utils";

/**
 * The P record, in the current look's colours (the desktop icon stays ink and
 * paper). `detail` adds the groove ring, for sizes where it stays legible.
 */
export function PorchlightMark({ className, detail = false }: { className?: string; detail?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="14" fill="var(--brand)" />
      <g fill="var(--background)">
        <rect x="14" y="26" width="12" height="31" rx="2" />
        <circle cx="33" cy="26" r="19" />
      </g>
      {detail && <circle cx="33" cy="26" r="13" fill="none" stroke="var(--brand)" strokeWidth="1.4" />}
      <circle cx="33" cy="26" r={detail ? 5 : 6.5} fill="var(--brand)" />
    </svg>
  );
}
