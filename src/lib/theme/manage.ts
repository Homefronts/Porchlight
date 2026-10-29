export const MAX_NAME = 60;

/** A name for the file dialog: Windows-safe, never empty. */
export function exportFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[<>:"/\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/, "");
  return `${clean || "look"}.ytubic-theme.json`;
}

/** The trimmed name to save, or null when it is empty or too long. */
export function validName(input: string): string | null {
  const n = input.trim();
  return n && n.length <= MAX_NAME ? n : null;
}
