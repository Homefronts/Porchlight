import { useId, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  BUILT_IN_LOOKS,
  FONT_STACKS,
  type FontId,
  type LayoutId,
  type Look,
  type Seeds,
  type Touches,
} from "@/lib/theme/looks";
import { baseOf, editLook, lowContrast, paletteInUse } from "@/lib/theme/edit";
import { useThemeStore } from "@/lib/theme/store";
import { cn } from "@/lib/utils";
import { ColourRow } from "./colour-row";

export type LookEditorValue = { look: Look; layout: LayoutId };

const DESCRIPTIONS: Record<string, string> = {
  sleeve: "Dark liner notes (new default)",
  paper: "Light, like a record sleeve",
  "ink-liner": "Pure black, art is the colour",
  ink: "Pure black, quiet, lowercase",
  classic: "The original YTubic look",
};

const COLOURS: [keyof Seeds, string][] = [
  ["bg", "Background"],
  ["fg", "Text"],
  ["acc", "Accent"],
  ["dim", "Secondary text"],
  ["faint", "Faint text"],
  ["line", "Lines"],
];

const FONT_NAMES: Record<FontId, string> = {
  "instrument-serif": "Instrument Serif",
  archivo: "Archivo",
  "jetbrains-mono": "JetBrains Mono",
  inter: "Inter",
  system: "System",
};

const FONT_ROLES = [
  ["headline", "Headline font"],
  ["display", "Title font"],
  ["meta", "Detail font"],
] as const;

const RADII = [
  ["window", "Window corners"],
  ["cover", "Cover corners"],
  ["button", "Button corners"],
] as const;

const TOUCHES: [keyof Touches, string][] = [
  ["vinyl", "Vinyl peeking out"],
  ["numbers", "Section numbers (A1, B2)"],
  ["uppercase", "Uppercase titles"],
  ["offsetShadows", "Offset cover shadows"],
  ["tapeCounter", "Tape counter for progress"],
  ["textTransport", "Text transport buttons"],
];

// Outline diagrams of each layout, from the first-launch mockup.
const LAYOUTS: [LayoutId, string, ReactNode][] = [
  ["sidebar", "Sidebar", <>
    <rect x="3" y="3" width="10" height="30" fill="currentColor" opacity=".35" />
    <rect x="45" y="3" width="12" height="30" fill="currentColor" opacity=".35" />
  </>],
  ["gatefold", "Gatefold", <rect x="3" y="3" width="26" height="30" fill="currentColor" opacity=".35" />],
  ["index", "Index", <rect x="3" y="3" width="54" height="5" fill="currentColor" opacity=".35" />],
  ["crate", "Crate", <>
    <rect x="3" y="27" width="54" height="6" fill="currentColor" opacity=".35" />
    <rect x="20" y="8" width="16" height="16" fill="currentColor" opacity=".35" />
  </>],
  ["panels", "Panels", <>
    <rect x="3" y="3" width="12" height="24" rx="2" fill="currentColor" opacity=".35" />
    <rect x="17" y="3" width="40" height="24" rx="2" fill="currentColor" opacity=".2" />
    <rect x="3" y="29" width="54" height="4" rx="1" fill="currentColor" opacity=".35" />
  </>],
];

const card = (on: boolean) =>
  cn(
    "rounded-[var(--radius-button,10px)] border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on ? "border-acc1 shadow-[0_0_0_1px_var(--acc1)]" : "border-border hover:border-t10",
  );

function Label({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mt-[18px] mb-2 flex justify-between font-meta text-[11px] uppercase tracking-[0.1em] text-t6">
      <span>{children}</span>
      {note ? <span className="text-t10">{note}</span> : null}
    </div>
  );
}

function LookCard({ look, on, compact, onPick }: { look: Look; on: boolean; compact?: boolean; onPick: () => void }) {
  const { bg, fg, acc, dim } = look.seeds;
  return (
    <button type="button" aria-pressed={on} onClick={onPick} className={cn(card(on), "p-2")}>
      <div aria-hidden="true" className={cn("flex overflow-hidden rounded-[6px]", compact ? "h-9" : "h-[54px]")}>
        <i className="flex-[3]" style={{ background: bg }} />
        <i className="flex-1" style={{ background: fg }} />
        <i className="flex-1" style={{ background: acc }} />
        <i className="flex-1" style={{ background: dim }} />
      </div>
      <div className="mt-1.5 truncate text-[13px] font-semibold text-t1">{look.name}</div>
      {!compact && (
        <div className="text-[11px] leading-snug text-t6">
          {DESCRIPTIONS[look.id] ?? `Based on ${BUILT_IN_LOOKS[look.base].name}`}
        </div>
      )}
    </button>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-1.5 text-xs text-t3">
      {label}
      {children}
    </div>
  );
}

/**
 * Pick a look and a layout, change its colours, and open Advanced for fonts,
 * shapes and touches. Controlled, and nothing is saved from here: editing a
 * built-in gives a draft ("Sleeve, edited", no id) in `value`, which the
 * parent saves with `commitDraft`. The built-in never changes.
 */
export function LookEditor({
  value,
  onChange,
  compact,
}: {
  value: LookEditorValue;
  onChange: (next: LookEditorValue) => void;
  compact?: boolean;
}) {
  const custom = useThemeStore((s) => s.custom);
  const { resolvedTheme, forcedTheme } = useTheme();
  const mode = (forcedTheme ?? resolvedTheme) === "light" ? "light" : "dark";
  const [open, setOpen] = useState(false);
  const advId = useId();

  const look = paletteInUse(value.look, mode);
  const base = baseOf(look);
  // The draft shows in Yours: in place of its saved copy, or after them if new.
  const yours = custom.map((l) => (l.id === look.id ? look : l));
  if (look.id === "") yours.push(look);

  // Edits stay in the value; the parent saves with commitDraft.
  const edit = (patch: Partial<Look>) =>
    onChange({ ...value, look: editLook(look, patch) });
  const pick = (l: Look) => onChange({ ...value, look: paletteInUse(l, mode) });

  return (
    <div className="text-t1">
      <Label note={`${Object.keys(BUILT_IN_LOOKS).length} presets`}>Look</Label>
      <div className={cn("grid gap-2.5", compact ? "grid-cols-3" : "grid-cols-2")}>
        {Object.values(BUILT_IN_LOOKS).map((l) => (
          <LookCard key={l.id} look={paletteInUse(l, mode)} on={l.id === look.id} compact={compact} onPick={() => pick(l)} />
        ))}
      </div>
      {yours.length > 0 && (
        <>
          <Label note={String(yours.length).padStart(2, "0")}>Yours</Label>
          <div className={cn("grid gap-2.5", compact ? "grid-cols-3" : "grid-cols-2")}>
            {yours.map((l) => (
              <LookCard key={l.id || "draft"} look={l} on={l.id === look.id} compact={compact} onPick={() => pick(l)} />
            ))}
          </div>
        </>
      )}

      <Label note="Preview any of them">Layout</Label>
      <div className="grid grid-cols-5 gap-2">
        {LAYOUTS.map(([id, name, shapes]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value.layout === id}
            aria-label={id === "sidebar" ? name : `${name}, comes in a later update`}
            onClick={() => onChange({ ...value, layout: id })}
            className={cn(card(value.layout === id), "p-1.5 text-center text-[11px] text-t3", id !== "sidebar" && value.layout !== id && "opacity-60")}
          >
            <svg aria-hidden="true" viewBox="0 0 60 36" className="mb-1 block h-9 w-full">
              <rect x="1" y="1" width="58" height="34" rx="3" fill="none" stroke="currentColor" opacity=".4" />
              {shapes}
            </svg>
            {name}
            {id !== "sidebar" && (
              <small className="block font-meta text-[9px] text-t10">LATER UPDATE</small>
            )}
          </button>
        ))}
      </div>

      <Label note="Defaults shown">Colours</Label>
      <div className="grid grid-cols-2 gap-2">
        {COLOURS.map(([k, name]) => (
          <ColourRow
            key={k}
            label={name}
            value={look.seeds[k]}
            fallback={base.seeds[k]}
            onChange={(hex) => edit({ seeds: { ...look.seeds, [k]: hex } })}
          />
        ))}
      </div>
      {/* Always mounted so screen readers announce the text when it appears. */}
      <p role="status" className="mt-2 text-xs font-medium text-t2">
        {lowContrast(look.seeds) ? "Text may be hard to read" : ""}
      </p>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={advId}
        onClick={() => setOpen((o) => !o)}
        className="mt-[18px] flex w-full items-center justify-between rounded-[var(--radius-button,8px)] border border-dashed border-t10/60 px-3 py-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          <b className="font-semibold">Advanced</b>
          <br />
          <span className="text-xs text-t6">Fonts, shapes, the small touches</span>
        </span>
        <IconChevronDown aria-hidden="true" className={cn("size-4 text-t6 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div id={advId} className="mt-2">
          {FONT_ROLES.map(([role, name]) => (
            <Row key={role} label={name}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label={`${name}: ${FONT_NAMES[look.fonts[role]]}`} className="w-[150px] justify-between">
                    <span style={{ fontFamily: FONT_STACKS[look.fonts[role]] }}>{FONT_NAMES[look.fonts[role]]}</span>
                    <IconChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={look.fonts[role]}
                    onValueChange={(f) => edit({ fonts: { ...look.fonts, [role]: f as FontId } })}
                  >
                    {(Object.keys(FONT_NAMES) as FontId[]).map((f) => (
                      <DropdownMenuRadioItem key={f} value={f} style={{ fontFamily: FONT_STACKS[f] }}>
                        {FONT_NAMES[f]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </Row>
          ))}
          {RADII.map(([k, name]) => (
            <Row key={k} label={<span>{name} <span className="font-meta text-t10">{look.radius[k]}px</span></span>}>
              <Slider
                aria-label={name}
                min={0}
                max={24}
                step={1}
                value={[look.radius[k]]}
                onValueChange={([v]) => edit({ radius: { ...look.radius, [k]: v } })}
                className="w-[150px] py-2"
              />
            </Row>
          ))}
          {TOUCHES.map(([k, name]) => (
            <Row key={k} label={name}>
              <Switch
                aria-label={name}
                checked={look.touches[k]}
                onCheckedChange={(on) => edit({ touches: { ...look.touches, [k]: on } })}
              />
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
