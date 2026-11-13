import { getLocale, t } from "./i18n";

/** "1.4 MB"-style human size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** "3h ago"-style relative time from unix seconds; dates past a week. */
export function formatRelative(unixSecs: number): string {
  if (!unixSecs) return "";
  const diff = Math.max(0, Date.now() / 1000 - unixSecs);
  if (diff < 60) return t("time.justNow");
  if (diff < 3600) return t("time.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("time.hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return t("time.daysAgo", { count: Math.floor(diff / 86400) });
  const d = new Date(unixSecs * 1000);
  return d.toLocaleDateString(getLocale());
}

/** "Jul 11, 2026, 3:42 PM"-style absolute date + time from unix ms,
 *  localized to the user's system settings. */
export function formatDateTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
