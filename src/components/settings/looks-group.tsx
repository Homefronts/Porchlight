import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { IconFileExport, IconFileImport, IconVinyl, IconPalette, IconPencil, IconTrash, IconVolume } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Group, SettingRow } from "@/components/settings/primitives";
import { ConfirmUnreadable } from "@/components/theme/confirm-unreadable";
import { flipTo } from "@/components/theme/layout-flip";
import { LookEditor, type LookEditorValue } from "@/components/theme/look-editor";
import { LookPreview } from "@/components/theme/look-preview";
import { usePreviewSample } from "@/components/theme/make-it-yours";
import { commitDraft, isBuiltIn, isUnreadable, paletteInUse } from "@/lib/theme/edit";
import { parseThemeFile, toThemeFile } from "@/lib/theme/file";
import { applyImport, layoutOfferText } from "@/lib/theme/layouts";
import { exportFileName, MAX_NAME, validName } from "@/lib/theme/manage";
import { activeLook, useThemeStore, type NeedleDrop } from "@/lib/theme/store";

const startValue = (): LookEditorValue => {
  const s = useThemeStore.getState();
  return { look: activeLook(s), layout: s.layout };
};

const NEEDLE_STYLES: [NeedleDrop, string][] = [
  ["gentle", "Gentle"],
  ["quick", "Quick"],
  ["slow", "Slow cue"],
];

/**
 * Settings > Appearance > Look. Picking a built-in or saved look applies it at
 * once; editing makes a draft that only "Use this look" saves and activates,
 * so nothing restyles the app while a colour is being dragged.
 */
export function LooksGroup() {
  const custom = useThemeStore((s) => s.custom);
  // The layout applies at once and can also change from the dial or Ctrl+L,
  // so it is read live rather than kept in the draft.
  const layout = useThemeStore((s) => s.layout);
  const dialSound = useThemeStore((s) => s.dialSound);
  const needleDrop = useThemeStore((s) => s.needleDrop);
  const needleHead = useThemeStore((s) => s.needleHead);
  const [draftLook, setDraft] = useState<LookEditorValue>(startValue);
  const draft = { ...draftLook, layout };
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The activation waiting on the "hard to read" confirmation.
  const [ask, setAsk] = useState<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Radix moves focus into the dialog; the plain autoFocus attribute loses to it.
  const focusOnMount = useCallback((el: HTMLElement | null) => el?.focus(), []);
  const { resolvedTheme, forcedTheme } = useTheme();
  const mode = (forcedTheme ?? resolvedTheme) === "light" ? "light" : "dark";
  const look = paletteInUse(draft.look, mode);
  const sample = usePreviewSample(look);

  const saved = custom.find((l) => l.id === look.id);
  const pristine = (l: typeof look) =>
    isBuiltIn(l) || JSON.stringify(custom.find((c) => c.id === l.id)) === JSON.stringify(l);
  const dirty = !pristine(look);

  const change = (next: LookEditorValue) => {
    if (next.layout !== layout) return flipTo(next.layout);
    setRenaming(null);
    setConfirming(false);
    if (!pristine(next.look)) return setDraft(next);
    // An untouched look applies at once; an edited one waits for the button.
    const apply = () => {
      setDraft(next);
      useThemeStore.getState().setActive(next.look.id);
    };
    if (isUnreadable(next.look)) setAsk(() => apply);
    else apply();
  };

  const use = () => {
    const apply = () => {
      const s = useThemeStore.getState();
      const id = commitDraft(look, s);
      s.setActive(id);
      setDraft(startValue());
      toast.success(`Now using ${look.name}`);
    };
    if (isUnreadable(look)) setAsk(() => apply);
    else apply();
  };

  const rename = () => {
    const name = validName(renaming ?? "");
    if (!name || !saved) return;
    useThemeStore.getState().renameCustom(saved.id, name);
    setDraft({ ...draft, look: { ...look, name } });
    setRenaming(null);
  };

  const remove = () => {
    if (!saved) return;
    useThemeStore.getState().deleteCustom(saved.id);
    setConfirming(false);
    setDraft(startValue());
    toast.success(`Deleted ${saved.name}`);
  };

  const exportLook = async () => {
    try {
      const done = await invoke<boolean>("save_text_file", {
        contents: toThemeFile(look, draft.layout),
        name: exportFileName(look.name),
        filterName: "Porchlight theme",
        ext: "json",
      });
      if (done) toast.success(`Exported ${look.name}`);
    } catch (e) {
      toast.error(`Couldn't export that look. ${String(e)}`);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const res = parseThemeFile(await file.text().catch(() => ""));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    // Imports land under Yours; the person decides when to use them.
    const offer = applyImport(res);
    toast.success(`Imported ${res.look.name}`, {
      description: res.notes.length ? res.notes.join(" ") : undefined,
    });
    if (offer) {
      toast(layoutOfferText(offer), {
        duration: 10_000,
        // Toast titles truncate to one line; this one is the question.
        classNames: { title: "whitespace-normal!" },
        action: { label: "Switch", onClick: () => flipTo(offer) },
      });
    }
  };

  return (
    <Group>
      <ConfirmUnreadable
        open={ask !== null}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          ask?.();
          setAsk(null);
        }}
      />
      <div className="flex flex-col gap-4 py-4">
        <div className="mx-auto w-full max-w-[460px]">
          <LookPreview look={look} layout={draft.layout} sample={sample} />
        </div>
        <LookEditor value={draft} onChange={change} compact />
        {dirty ? (
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-t6">Not saved yet. The app keeps its current look.</span>
            <Button size="sm" variant="outline" onClick={() => setDraft(startValue())}>
              Discard changes
            </Button>
            <Button size="sm" onClick={use}>
              Use this look
            </Button>
          </div>
        ) : null}
      </div>
      <SettingRow
        icon={IconPalette}
        title={saved ? saved.name : "Share this look"}
        description={saved ? "One of your saved looks." : "Export a look to a file you can share, or import one."}
        control={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void exportLook()}>
              <IconFileExport />
              Export
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
              <IconFileImport />
              Import
            </Button>
          </div>
        }
      />
      <SettingRow
        icon={IconVolume}
        title="Dial Click"
        description="A soft click when you turn the layout dial in the title bar."
        control={
          <Switch
            checked={dialSound}
            onCheckedChange={(on) => useThemeStore.setState({ dialSound: on })}
            aria-label="Dial Click"
          />
        }
      />
      {layout === "crate" && (
        <>
          <SettingRow
            icon={IconVinyl}
            title="Needle Drop"
            description="How the arm puts the needle on the record when a song starts."
            control={
              <div role="radiogroup" aria-label="Needle Drop" className="flex gap-1.5">
                {NEEDLE_STYLES.map(([id, name]) => (
                  <Button
                    key={id}
                    size="sm"
                    role="radio"
                    aria-checked={needleDrop === id}
                    variant={needleDrop === id ? "default" : "outline"}
                    onClick={() => useThemeStore.setState({ needleDrop: id })}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            }
          />
          <SettingRow
            icon={IconVinyl}
            title="Needle Head"
            description="Draw a needle head and pivot on the arm, or keep it a plain bar."
            control={
              <Switch
                checked={needleHead}
                onCheckedChange={(on) => useThemeStore.setState({ needleHead: on })}
                aria-label="Needle Head"
              />
            }
          />
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Import a theme file"
        className="hidden"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {saved && !dirty ? (
        <SettingRow
          icon={IconPencil}
          title="Rename or delete"
          description={
            confirming ? `Delete ${saved.name}? This can't be undone.` : "Only your own looks can be renamed or deleted."
          }
          control={
            confirming ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" ref={focusOnMount} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={remove}>
                  <IconTrash />
                  Delete
                </Button>
              </div>
            ) : renaming !== null ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename();
                }}
              >
                <Input
                  autoFocus
                  aria-label="Look name"
                  maxLength={MAX_NAME}
                  value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                  className="h-8 w-[170px]"
                />
                <Button size="sm" type="submit" disabled={!validName(renaming)}>
                  Save
                </Button>
                <Button size="sm" type="button" variant="outline" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRenaming(saved.name)}>
                  <IconPencil />
                  Rename
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
                  <IconTrash />
                  Delete
                </Button>
              </div>
            )
          }
        />
      ) : null}
    </Group>
  );
}
