import { cn } from "@/lib/utils";

/**
 * One colour of a look: a picker, its name, and "default" or, once it differs
 * from the base look's value, a "reset" button.
 */
export function ColourRow({
  label,
  value,
  fallback,
  onChange,
  onReset,
  defaultNote = "default",
}: {
  label: string;
  /** Undefined for an optional colour left unset; the picker shows `fallback`. */
  value: string | undefined;
  /** The base look's value; "reset" puts this back. */
  fallback: string;
  onChange: (hex: string) => void;
  /** An optional colour clears itself on reset instead. */
  onReset?: () => void;
  defaultNote?: string;
}) {
  const changed = value !== undefined && (onReset !== undefined || value !== fallback);
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-button,8px)] border border-border px-2 py-1.5 text-xs text-t3">
      <input
        type="color"
        aria-label={`${label} colour`}
        value={value ?? fallback}
        // The picker hands back #rrggbb; lower-case is what deriveTokens parses.
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="size-[26px] shrink-0 cursor-pointer rounded-[4px] border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="min-w-0 flex-1 leading-tight">{label}</span>
      {changed ? (
        <button
          type="button"
          aria-label={`Reset ${label} to default`}
          onClick={onReset ?? (() => onChange(fallback))}
          className={cn(
            "font-meta text-[10px] text-acc1 hover:underline",
            "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          reset
        </button>
      ) : (
        <span className="font-meta text-[10px] text-t10">{defaultNote}</span>
      )}
    </div>
  );
}
