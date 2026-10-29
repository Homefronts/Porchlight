/** A CSS url("...") that stays one token for any string, quotes and newlines included. */
export const cssUrl = (src: string) =>
  `url("${src
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\a ")}")`;
