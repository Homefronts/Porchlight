import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RewindStory } from "@/components/rewind/rewind-story";
import { paletteOf, quarterLabel, slidesFor } from "@/components/rewind/slides";
import { unseenRewind } from "@/lib/rewind/home";
import { rewindLog } from "@/lib/rewind/log";
import { saveSlideImage } from "@/lib/rewind/save-image";
import { ensureLastRewind } from "@/lib/rewind/seal";
import type { Rewind } from "@/lib/rewind/types";
import { useSettingsStore } from "@/lib/store/settings";

export const rewindsQuery = {
  queryKey: ["rewinds"],
  queryFn: async () => {
    await ensureLastRewind();
    return rewindLog.rewinds();
  },
  staleTime: 60_000,
};

async function save(node: HTMLElement, name: string) {
  try {
    if (await saveSlideImage(node, name)) toast.success("Slide saved");
  } catch (e) {
    toast.error("Couldn't save the slide", { description: String(e) });
  }
}

/** Opening a rewind marks it seen (clears the Home card). */
export function useRewindStory() {
  const [open, setOpen] = useState<Rewind | null>(null);
  const markSeen = useSettingsStore((s) => s.markRewindSeen);
  const story = open ? <RewindStory rewind={open} onClose={() => setOpen(null)} onSave={save} /> : null;
  return {
    story,
    show: (r: Rewind) => {
      markSeen(r.quarter);
      setOpen(r);
    },
  };
}

export function rewindBackground(r: Rewind): string {
  const p = paletteOf(slidesFor(r)[0], r);
  return `radial-gradient(130% 90% at 80% 10%, ${p.bg[0]} 0%, ${p.bg[1]} 45%, ${p.bg[2]} 100%)`;
}

/** "Your Rewind is ready" banner at the top of Home, until it's opened. */
export function RewindHomeCard() {
  const rewinds = useQuery(rewindsQuery);
  const seen = useSettingsStore((s) => s.seenRewind);
  const { story, show } = useRewindStory();
  const r = unseenRewind(rewinds.data ?? [], seen);
  if (!r) return story;
  const accent = paletteOf(slidesFor(r)[0], r).accent;
  return (
    <>
      <button
        type="button"
        onClick={() => show(r)}
        className="flex items-center justify-between gap-4 rounded-xl px-6 py-5 text-left text-white"
        style={{ background: rewindBackground(r) }}
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
            Your Rewind is ready
          </div>
          <div className="mt-1 text-2xl font-black">{quarterLabel(r)}</div>
        </div>
        <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">Watch</span>
      </button>
      {story}
    </>
  );
}
