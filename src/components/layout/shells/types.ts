import type { ReactNode } from "react";

export type ShellSlots = { page: ReactNode; nav: ReactNode; dial: ReactNode };
export type ShellProps = ShellSlots & { hasTrack: boolean };

/**
 * Every shell calls useShellInsets (insets.ts) with these, which land on
 * <html> as two CSS vars read by the page overlays (jump-to-current pill,
 * selection toolbar, toasts):
 * - `--shell-bottom-inset`: distance from the window bottom that clears
 *   the shell's bottom chrome (a player bar).
 * - `--shell-right-inset`: distance from the window right edge that clears
 *   the shell's right chrome (a side card or panel).
 */
export type ShellInsets = { bottom: string; right: string };
