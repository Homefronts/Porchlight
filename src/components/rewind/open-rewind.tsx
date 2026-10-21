import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RewindStory } from "@/components/rewind/rewind-story";
import { REWIND_COVER, quarterLabel } from "@/components/rewind/slides";
import { unseenRewind } from "@/lib/rewind/home";
import { rewindLog } from "@/lib/rewind/log";
import { saveSlideImage } from "@/lib/rewind/save-image";
import { playSoundtrack } from "@/lib/rewind/soundtrack";
import type { Rewind } from "@/lib/rewind/types";
import { useSettingsStore } from "@/lib/store/settings";

export const rewindsQuery = {
  queryKey: ["rewinds"],
  // Read only: sealing runs from the idle-time scheduler, never on page load.
  queryFn: () => rewindLog.rewinds(),
  staleTime: 60_000,
};

async function save(node: HTMLElement, name: string) {
  try {
    if (await saveSlideImage(node, name)) toast.success("Slide saved");
  } catch (e) {
    toast.error("Couldn't save the slide", { description: String(e) });
  }
}

/** Opening a rewind marks it seen (clears the Home card) and plays its top songs until it closes. */
export function useRewindStory() {
  const [open, setOpen] = useState<Rewind | null>(null);
  const restore = useRef<() => void>(undefined);
  const markSeen = useSettingsStore((s) => s.markRewindSeen);
  const close = () => {
    restore.current?.();
    restore.current = undefined;
    setOpen(null);
  };
  const story = open ? <RewindStory rewind={open} onClose={close} onSave={save} /> : null;
  return {
    story,
    /** A preview of the open quarter isn't "seen": its real rewind still gets the Home card. */
    show: (r: Rewind, preview = false) => {
      if (!preview) markSeen(r.quarter);
      restore.current ??= playSoundtrack(r);
      setOpen(r);
    },
  };
}

/** "Your Rewind is ready" banner at the top of Home, until it's opened. */
export function RewindHomeCard() {
  const rewinds = useQuery(rewindsQuery);
  const seen = useSettingsStore((s) => s.seenRewind);
  const { story, show } = useRewindStory();
  const r = unseenRewind(rewinds.data ?? [], seen);
  if (!r) return story;
  return (
    <>
      <button
        type="button"
        onClick={() => show(r)}
        className="flex items-center justify-between gap-4 rounded-xl px-6 py-5 text-left text-white"
        style={{ background: REWIND_COVER.bg }}
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: REWIND_COVER.hi }}>
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
