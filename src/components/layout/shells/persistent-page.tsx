import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Held = { node: HTMLElement; scrollTop: number; focus: HTMLElement | null };

/**
 * Keeps the routed page mounted while the shell around it is swapped.
 * The page is portaled into one long-lived DOM node owned by the caller,
 * so it never remounts; `page` is a placeholder each shell renders where
 * the page belongs, and it moves that node in. Render `portal` AFTER the
 * shell: layout effects run in tree order, so the node is already in the
 * document when the page's own layout effects measure it on first mount.
 */
export function usePersistentPage(content: ReactNode): {
  page: ReactNode;
  portal: ReactNode;
} {
  const [held] = useState<Held>(() => {
    const node = document.createElement("div");
    node.style.display = "contents";
    return { node, scrollTop: 0, focus: null };
  });
  return {
    page: <PageSlot held={held} />,
    portal: createPortal(content, held.node),
  };
}

function PageSlot({ held }: { held: Held }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current!;
    const { node } = held;
    host.appendChild(node);
    // Reparenting can reset the scroller's scrollTop (WebView2 does) and
    // always drops focus, so put back what the last slot saved.
    const scroller = node.firstElementChild;
    if (scroller && held.scrollTop) scroller.scrollTop = held.scrollTop;
    if (held.focus?.isConnected) held.focus.focus({ preventScroll: true });
    return () => {
      held.scrollTop = node.firstElementChild?.scrollTop ?? 0;
      const active = document.activeElement;
      held.focus =
        active instanceof HTMLElement && node.contains(active) ? active : null;
      if (node.parentNode === host) host.removeChild(node);
    };
  }, [held]);
  // display: contents so the two wrappers add no box to the shell's layout.
  return <div ref={ref} style={{ display: "contents" }} />;
}
