import { useAiClass } from "@/lib/ai/use-ai";
import { cn } from "@/lib/utils";

/**
 * The "AI" chip shown next to the title of an AI-generated song. Drawn
 * like `ExplicitBadge` so the two sit together; "AI?" (a same-name match
 * we couldn't confirm) is the same chip, quieter.
 */
export function AiBadge({ maybe }: { maybe?: boolean }) {
  const label = maybe
    ? "Possibly AI: shares a name with a known AI artist"
    : "AI-generated";
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-[17px] shrink-0 items-center justify-center rounded-sm bg-black/12 px-1 text-[10.5px] font-bold leading-none text-t4 outline outline-1 -outline-offset-1 outline-w060 dark:bg-black/25 dark:outline-w120",
        maybe && "opacity-60",
      )}
    >
      {maybe ? "AI?" : "AI"}
    </span>
  );
}

/** Classifies `item` and renders its chip, or nothing. */
export function AiTag({ item }: { item: { artists?: { id?: string; name: string }[] } }) {
  const cls = useAiClass(item);
  return cls ? <AiBadge maybe={cls === "maybe"} /> : null;
}
