import type { ReactNode } from "react";
import { isLinerLook } from "@/lib/theme/looks";
import { useActiveLook } from "@/lib/theme/store";
import { cn } from "@/lib/utils";

export type LookFamily = "liner" | "ink" | "classic";

/** Which type treatment the active look wants, by its base. */
export function useLookFamily(): LookFamily {
  const look = useActiveLook();
  if (isLinerLook(look)) return "liner";
  return look.base === "ink" ? "ink" : "classic";
}

/**
 * Extra classes for a record's title (cards, the top search result): heavy
 * uppercase Archivo under Liner, quiet lowercase under Ink, nothing under
 * Classic. Merge over the element's own classes with `cn`.
 */
export function recordTitleClass(family: LookFamily): string {
  if (family === "liner") return "font-display look-case font-black tracking-[-0.01em]";
  if (family === "ink") return "font-display font-medium lowercase";
  return "";
}

/** A page's title: big serif under Liner, quiet sans under Ink, today's heading under Classic. */
export function PageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const family = useLookFamily();
  return (
    <h1
      className={cn(
        "text-3xl font-bold tracking-tight",
        family !== "classic" && "font-headline",
        family === "liner" && "text-5xl font-normal leading-none tracking-[-0.01em]",
        family === "ink" && "font-medium",
        className,
      )}
    >
      {children}
    </h1>
  );
}
