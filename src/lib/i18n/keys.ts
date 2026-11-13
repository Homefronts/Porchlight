import type en from "../../locales/en.json";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

type StripPlural<S extends string> = S extends `${infer B}_${"zero" | "one" | "two" | "few" | "many" | "other"}` ? B : S;

/** Every string in en.json as a dotted path; plural forms count once, without their suffix. */
export type Key = StripPlural<Leaves<typeof en>>;
