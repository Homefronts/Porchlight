import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const blobs = new Map<string, Promise<string | null>>();

/**
 * The cover as a blob: URL. Fetched through plugin-http (Rust side), so the
 * image is same-origin and save-as-image can draw it.
 */
export function coverBlobUrl(url: string): Promise<string | null> {
  let p = blobs.get(url);
  if (!p) {
    p = tauriFetch(url)
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    blobs.set(url, p);
  }
  return p;
}
