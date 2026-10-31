import { createContext, type ReactNode } from "react";

/** The shell's `dial`, handed to whichever chrome holds the logo. */
export const DialSlot = createContext<ReactNode>(null);
