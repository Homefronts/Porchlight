import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [node] = useState(() => {
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  });
  return {
    page: <PageSlot node={node} />,
    portal: createPortal(content, node),
  };
}

function PageSlot({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current!;
    host.appendChild(node);
    return () => {
      if (node.parentNode === host) host.removeChild(node);
    };
  }, [node]);
  // display: contents so the two wrappers add no box to the shell's layout.
  return <div ref={ref} style={{ display: "contents" }} />;
}
