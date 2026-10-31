import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

/**
 * Where a route pins its own header (Home's title row). Shared through
 * context rather than found in the DOM, so swapping the shell hands the
 * page the new slot and its portal follows.
 */
export const RouteHeaderSlotContext = createContext<HTMLElement | null>(null);
const SetSlotContext = createContext<(el: HTMLElement | null) => void>(
  () => {},
);

/** Wraps both the shell (which renders the slot) and the page (which uses it). */
export function RouteHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <SetSlotContext.Provider value={setSlot}>
      <RouteHeaderSlotContext.Provider value={slot}>
        {children}
      </RouteHeaderSlotContext.Provider>
    </SetSlotContext.Provider>
  );
}

export function RouteHeaderSlot({ className }: { className?: string }) {
  return (
    <div
      ref={useContext(SetSlotContext)}
      data-route-header-slot
      className={className}
    />
  );
}
