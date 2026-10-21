import { invoke } from "@tauri-apps/api/core";

// shortcut: hand-rolled DOM-to-PNG (inline computed styles into an SVG
// foreignObject), since no package manager was available to add
// html-to-image; swap to it if slides gain web fonts or pseudo-elements.
function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  (dst as HTMLElement).style.cssText = Array.from(cs, (p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
}

async function toDataUrl(src: string): Promise<string> {
  const blob = await (await fetch(src)).blob();
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(blob);
  });
}

async function renderPng(node: HTMLElement, scale = 2): Promise<Blob | null> {
  const { width, height } = node.getBoundingClientRect();
  const clone = node.cloneNode(true) as HTMLElement;
  inlineStyles(node, clone);
  clone.style.visibility = "visible";
  // Covers are blob: URLs; the SVG image needs them embedded.
  for (const img of Array.from(clone.querySelectorAll("img"))) img.src = await toDataUrl(img.src);
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return new Promise((res) => canvas.toBlob(res, "image/png"));
}

/** Save the slide on screen as a PNG through the system save dialog. */
export async function saveSlideImage(node: HTMLElement, name: string): Promise<boolean> {
  const png = await renderPng(node);
  if (!png) return false;
  const bytes = Array.from(new Uint8Array(await png.arrayBuffer()));
  return invoke<boolean>("save_png", { bytes, name });
}
