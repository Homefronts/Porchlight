export const MAX_NAME = 60;

// Windows refuses these as a file's base name, whatever the extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A name for the file dialog: Windows-safe, never empty. */
export function exportFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/, "");
  if (RESERVED.test(clean.split(".")[0].trim())) clean = `look-${clean}`;
  return `${clean || "look"}.ytubic-theme.json`;
}

/** The trimmed name to save, or null when it is empty or too long. */
export function validName(input: string): string | null {
  const n = input.trim();
  return n && n.length <= MAX_NAME ? n : null;
}
