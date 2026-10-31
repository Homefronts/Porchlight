import type { ReactNode } from "react";

export type ShellSlots = { page: ReactNode; nav: ReactNode; dial: ReactNode };
export type ShellProps = ShellSlots & { hasTrack: boolean };
