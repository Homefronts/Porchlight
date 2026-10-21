import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rewindBackground, rewindsQuery, useRewindStory } from "@/components/rewind/open-rewind";
import { paletteOf, quarterLabel, slidesFor } from "@/components/rewind/slides";
import type { Rewind } from "@/lib/rewind/types";

export const Route = createFileRoute("/rewind")({
  component: RewindPage,
});

/** Everything here is built from the on-device log: nothing is uploaded. */
function RewindPage() {
  const rewinds = useQuery(rewindsQuery);
  const { story, show } = useRewindStory();

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rewind</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your listening, told back to you every quarter. Built and kept on this computer only.
        </p>
      </div>
      {rewinds.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Your first Rewind appears after this quarter ends. Keep listening, or import this quarter's history in
          Settings &gt; Storage.
        </p>
      ) : null}
      <div className="grid w-full gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))]">
        {rewinds.data?.map((r) => <RewindCard key={r.quarter} r={r} onOpen={() => show(r)} />)}
      </div>
      {story}
    </div>
  );
}

function RewindCard({ r, onOpen }: { r: Rewind; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex aspect-[3/4] flex-col justify-end rounded-xl p-4 text-left text-white transition-transform hover:scale-[1.02]"
      style={{ background: rewindBackground(r) }}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: paletteOf(slidesFor(r)[0], r).accent }}>
        Rewind
      </span>
      <span className="text-2xl font-black leading-tight">{quarterLabel(r)}</span>
      <span className="mt-1 text-xs text-white/70">{r.minutes.toLocaleString()} minutes</span>
    </button>
  );
}
