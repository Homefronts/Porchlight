import { useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconHighlight,
  IconLanguage,
  IconLanguageHiragana,
  IconWorld,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Group, SettingRow, TabPane } from "@/components/settings/primitives";
import {
  CHINESE_SOURCES,
  SOURCE_LABELS,
  TARGET_LANGS,
  useLyricsSettings,
  type LyricsSource,
} from "@/lib/store/lyrics-settings";
import { moveItem } from "@/lib/move-item";
import { cn } from "@/lib/utils";

const BADGE: Record<LyricsSource, "WORD" | "LINE" | "TEXT"> = {
  file: "WORD",
  kugou: "WORD",
  netease: "WORD",
  ytmusic: "LINE",
  lrclib: "LINE",
  musixmatch: "LINE",
  genius: "TEXT",
};

const ARROW =
  "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-t7 transition-colors duration-[140ms] hover:bg-w070 hover:text-t2 disabled:pointer-events-none disabled:opacity-30";

function SourceOrder() {
  const order = useLyricsSettings((s) => s.order);
  const off = useLyricsSettings((s) => s.off);
  const consent = useLyricsSettings((s) => s.chineseConsent);
  const setOrder = useLyricsSettings((s) => s.setOrder);
  const setOn = useLyricsSettings((s) => s.setOn);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const move = (from: number, to: number) => setOrder(moveItem(order, from, to));

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex flex-col gap-[3px]">
        <span className="text-sm font-semibold leading-none text-t2">Source order</span>
        <span className="text-[12.5px] leading-snug text-t7">
          Drag to choose which source is tried first. Word-by-word lyrics win over line-by-line ones.
        </span>
      </div>
      <ul className="flex flex-col gap-px">
        {order.map((s, i) => {
          const locked = CHINESE_SOURCES.includes(s) && consent !== "accepted";
          const label = SOURCE_LABELS[s];
          return (
            <li
              key={s}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", s);
                e.dataTransfer.effectAllowed = "move";
                setDragFrom(i);
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                // The indicator sits above the hovered row, so a downward move lands one short.
                if (dragFrom !== null && dragFrom !== i) move(dragFrom, dragFrom < i ? i - 1 : i);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              className={cn(
                "relative flex cursor-grab select-none items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-[140ms] hover:bg-w050 active:cursor-grabbing",
                dragFrom === i && "opacity-40",
                dragOver === i &&
                  dragFrom !== i &&
                  "before:pointer-events-none before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-acc1",
              )}
            >
              <IconGripVertical className="size-4 shrink-0 text-t8" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-t1">{label}</span>
              <span className="shrink-0 rounded border border-w070 px-1.5 py-px text-[10px] font-semibold tracking-wide text-t6">
                {BADGE[s]}
              </span>
              <button
                type="button"
                className={ARROW}
                aria-label={`Move ${label} up`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <IconChevronUp className="size-4" />
              </button>
              <button
                type="button"
                className={ARROW}
                aria-label={`Move ${label} down`}
                disabled={i === order.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <IconChevronDown className="size-4" />
              </button>
              <Switch
                checked={!locked && !off.includes(s)}
                disabled={locked}
                onCheckedChange={(on) => setOn(s, on)}
                aria-label={`Use ${label}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TargetLang() {
  const code = useLyricsSettings((s) => s.targetLang);
  const setTargetLang = useLyricsSettings((s) => s.setTargetLang);
  const label = TARGET_LANGS.find((l) => l.code === code)?.label ?? code;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Translation language"
          className="flex h-8 w-[170px] cursor-pointer items-center gap-2 rounded-[var(--radius-button,10px)] border border-w070 bg-w050 px-2.5 text-[13px] text-t2 transition-colors duration-[140ms] hover:bg-w070"
        >
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <IconChevronDown className="size-3 shrink-0 text-t6" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[170px]">
        {TARGET_LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => setTargetLang(l.code)}>
            <span className="flex-1 truncate">{l.label}</span>
            {code === l.code ? <IconCheck className="size-4 text-acc1!" stroke={2.4} /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LyricsTab() {
  const consent = useLyricsSettings((s) => s.chineseConsent);
  const answerConsent = useLyricsSettings((s) => s.answerConsent);
  const wordByWord = useLyricsSettings((s) => s.wordByWord);
  const romanize = useLyricsSettings((s) => s.romanize);
  const translate = useLyricsSettings((s) => s.translate);
  const setWordByWord = useLyricsSettings((s) => s.setWordByWord);
  const setRomanize = useLyricsSettings((s) => s.setRomanize);
  const setTranslate = useLyricsSettings((s) => s.setTranslate);

  return (
    <TabPane>
      <SourceOrder />
      <Group>
        <SettingRow
          icon={IconWorld}
          title="Kugou and NetEase"
          description="Two music services based in China with word-by-word lyrics. When on, they get each song's title, artist and length, and see your IP address like any website. Never your accounts, logins or listening history."
          control={
            <Switch
              checked={consent === "accepted"}
              onCheckedChange={answerConsent}
              aria-label="Kugou and NetEase"
            />
          }
        />
        <SettingRow
          icon={IconHighlight}
          title="Word-by-word highlight"
          description="Off lights up whole lines, like before."
          control={<Switch checked={wordByWord} onCheckedChange={setWordByWord} aria-label="Word-by-word highlight" />}
        />
        <SettingRow
          icon={IconLanguageHiragana}
          title="Show romanization"
          description="Japanese, Korean, Chinese, Russian and more, in Latin letters."
          control={<Switch checked={romanize} onCheckedChange={setRomanize} aria-label="Show romanization" />}
        />
        <SettingRow
          icon={IconLanguage}
          title="Translate lyrics"
          description="Adds a translation under songs in another language."
          control={
            <div className="flex items-center gap-2.5">
              {translate ? <TargetLang /> : null}
              <Switch checked={translate} onCheckedChange={setTranslate} aria-label="Translate lyrics" />
            </div>
          }
        />
      </Group>
    </TabPane>
  );
}
