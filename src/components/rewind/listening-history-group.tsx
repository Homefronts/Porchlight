import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconFileImport, IconHistory, IconLoader2, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Group, SettingRow } from "@/components/settings/primitives";
import { rewindLog } from "@/lib/rewind/log";
import { importTakeout } from "@/lib/rewind/takeout";
import { useSettingsStore } from "@/lib/store/settings";

const IMPORT_ERRORS = {
  html: "That's the HTML export. In Google Takeout, choose JSON for your YouTube history and try again.",
  invalid: "That file doesn't look like a Google Takeout watch history.",
  empty: "No YouTube Music plays from this quarter in that file.",
  cancelled: "Import cancelled.",
} as const;

/** Settings > Storage: Rewind's on-device listening history. */
export function ListeningHistoryGroup() {
  const on = useSettingsStore((s) => s.rewindHistory);
  const setOn = useSettingsStore((s) => s.setRewindHistory);
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<AbortController | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const ctl = new AbortController();
    setImporting(ctl);
    const res = await importTakeout(file, ctl.signal);
    setImporting(null);
    if ("added" in res) toast.success(res.added ? `Imported ${res.added.toLocaleString()} plays from this quarter` : "Already imported");
    else toast.error(IMPORT_ERRORS[res.error]);
  };

  const clear = async () => {
    if (!confirm("Clear your listening history? This also deletes your saved Rewinds.")) return;
    await rewindLog.clear();
    await qc.invalidateQueries({ queryKey: ["rewinds"] });
    toast.success("Listening history cleared");
  };

  return (
    <Group>
      <SettingRow
        icon={IconHistory}
        title="Keep listening history for Rewind"
        description="Stays on this computer and is never uploaded. Turning it off pauses logging and keeps what's saved."
        control={<Switch checked={on} onCheckedChange={setOn} aria-label="Keep listening history for Rewind" />}
      />
      <SettingRow
        icon={IconFileImport}
        title="Import past listening"
        description="Add this quarter's plays from a Google Takeout export (YouTube history, JSON). Read on this computer only."
        control={
          importing ? (
            <Button size="sm" variant="secondary" onClick={() => importing.abort()}>
              <IconLoader2 className="size-4 animate-spin" />
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
              Choose file
            </Button>
          )
        }
      />
      <input
        ref={input}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <SettingRow
        icon={IconTrash}
        title="Clear listening history"
        description="Deletes every logged play and all saved Rewinds."
        control={
          <Button size="sm" variant="secondary" onClick={() => void clear()}>
            Clear
          </Button>
        }
      />
    </Group>
  );
}
