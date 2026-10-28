import type { ReactNode } from "react";
import { useActiveLook } from "@/lib/theme/store";

type Props = {
  /** The section title. */
  children: ReactNode;
  /** Side letter for the liner label ("A" gives "SIDE A · TITLE"). */
  side?: string;
  /** Section position; gives the side letter (0 is A) when `side` is not set. */
  index?: number;
  /** Item count, shown on the right of the liner label ("03 RECORDS"). */
  count?: number;
  /** Control on the right of the heading (e.g. "Show all"); wins over the rest. */
  action?: ReactNode;
  /** Right-hand text of the plain heading. */
  subtitle?: ReactNode;
};

/**
 * A section heading. With the look's `numbers` touch it is a ruled mono
 * label ("SIDE A · LISTEN AGAIN", count on the right); otherwise the plain
 * shelf heading.
 */
export function SectionLabel({
  children,
  side,
  index,
  count,
  action,
  subtitle,
}: Props) {
  const numbers = useActiveLook().touches.numbers;

  if (!numbers) {
    return (
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="truncate text-xl font-semibold tracking-tight">
          {children}
        </h2>
        {action ? (
          <div className="shrink-0">{action}</div>
        ) : subtitle ? (
          <span className="truncate text-sm text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </div>
    );
  }

  const letter =
    side ?? (index !== undefined ? String.fromCharCode(65 + index) : null);
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border px-1 pt-2 font-meta text-[11px] uppercase tracking-[0.08em] text-t10">
      <h2 className="truncate">
        {letter ? `Side ${letter} · ` : null}
        {children}
      </h2>
      {action ? (
        <div className="shrink-0">{action}</div>
      ) : count !== undefined ? (
        <span className="shrink-0">
          {String(count).padStart(2, "0")} records
        </span>
      ) : null}
    </div>
  );
}

/** A liner track number ("A1"); nothing unless the look numbers things. */
export function TrackNumber({ value }: { value: string }) {
  if (!useActiveLook().touches.numbers) return null;
  return <div className="font-meta text-[11px] text-t10">{value}</div>;
}
