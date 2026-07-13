import { useEffect } from "react";
import { CloudSun, Moon, Play, Settings2, Sun, Volume2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSettings,
  type FaceId,
  type SoundSet,
  type Theme,
  type DigitalHue,
  type GrandfatherNumerals,
} from "@/lib/settings";
import { useTimeSync } from "@/lib/time/TimeSyncContext";
import { PROVIDER_CATALOG, PROVIDER_IDS, type ProviderId } from "@/lib/time.functions";
import { measureAudioLatencyMs, playPhrase, unlockAudio } from "@/lib/chimes/audio";
import { TRANSPOSE_OPTIONS } from "@/lib/chimes/westminster";

import { FACES, SETS } from "@/lib/catalog";
import type { ProviderSample } from "@/lib/time.functions";
import { BackgroundConsentRow } from "@/components/BackgroundConsentRow";
import { GrandfatherFace } from "@/components/faces/GrandfatherFace";
import { MidCenturyFace } from "@/components/faces/MidCenturyFace";
import { cn } from "@/lib/utils";

const NUMERAL_OPTIONS: { id: GrandfatherNumerals; label: string }[] = [
  { id: "roman", label: "Roman" },
  { id: "arabic", label: "Arabic" },
  { id: "eastern-arabic", label: "Eastern Arabic" },
];

const VALID_NUMERAL_IDS: readonly GrandfatherNumerals[] = NUMERAL_OPTIONS.map((o) => o.id);

/** True when `v` is one of the accepted {@link GrandfatherNumerals} literals. */
function isValidNumeral(v: unknown): v is GrandfatherNumerals {
  return typeof v === "string" && (VALID_NUMERAL_IDS as readonly string[]).includes(v);
}

/**
 * Selectable clock-face preview tile used in the settings drawer numeral
 * pickers. Consolidates the identical layout previously duplicated across
 * the Grandfather and Mid-Century numeral grids: a square live preview of
 * the given `face` with the option's label underneath, and pressed styling
 * driven by `active`.
 */
function NumeralPreviewButton({
  active,
  label,
  onSelect,
  preview,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
  preview: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors",
        active
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/60",
      )}
    >
      <div className="aspect-square w-full">{preview}</div>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

type LiveSource = ProviderSample;


/** Build the shareable OBS browser-source URL for the current face. */
function buildObsUrl(face: FaceId): string {
  return `${window.location.origin}/obs?face=${face}&transparent=1&size=520`;
}

/**
 * Copy the OBS browser-source URL to the clipboard. Silently no-ops when
 * the Clipboard API is unavailable (older Safari, insecure context).
 */
function copyObsUrl(face: FaceId): void {
  const url = buildObsUrl(face);
  void navigator.clipboard?.writeText(url);
}

/**
 * Trigger a browser download of the user's local settings and provider preferences
 * as a JSON file. Uses an ephemeral object URL revoked immediately after
 * the click so we don't leak Blob memory across repeated exports.
 */
function downloadUserDataAsJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.click();
  URL.revokeObjectURL(url);
}

/**
 * Wipe all locally persisted settings and provider preferences after user confirmation, then
 * reload so every provider re-initializes from defaults. No-op if the user
 * cancels the confirm dialog.
 */
function clearAllLocalDataAndReload(): void {
  if (!window.confirm("Erase all locally stored preferences and provider choices?")) return;
  try {
    window.localStorage.clear();
  } catch (err) {
    console.warn("[settings] failed to clear localStorage during reset", err);
  }
  window.location.reload();
}

/** Row in the selectable network time reference list. */
function ProviderRow({
  id,
  active,
  live,
  onToggle,
}: {
  id: ProviderId;
  active: boolean;
  live: LiveSource | undefined;
  onToggle: (id: ProviderId, on: boolean) => void;
}) {
  const provider = PROVIDER_CATALOG[id];
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <div className="truncate">{provider.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {live?.ok ? "A network sample is available" : "Waiting for a sample"}
        </div>
      </div>
      <Switch checked={active} onCheckedChange={(v) => onToggle(id, v)} />
    </li>
  );
}


/** Settings drawer for clock preferences and selectable network references. */
export function SettingsDrawer() {
  const settings = useSettings();
  const sync = useTimeSync();

  // Belt-and-braces: if the in-memory numeral style is ever invalid
  // (stale build, hand-edited localStorage, migration miss), snap it back
  // to Roman so the drawer + face render a valid, consistent choice.
  useEffect(() => {
    if (!isValidNumeral(settings.grandfatherNumerals)) {
      settings.update({ grandfatherNumerals: "roman" });
    }
  }, [settings.grandfatherNumerals, settings.update, settings]);


  const preview = async () => {
    await unlockAudio();
    void playPhrase("q1", {
      setId: settings.soundSet,
      volume: settings.masterVolume,
      speed: settings.chimeSpeed,
      transpose: settings.transposeSemitones,
    });
  };

  const toggleProvider = (id: ProviderId, on: boolean) => {
    // Set-based dedup avoids O(n²) indexOf-in-filter.
    const next = on
      ? Array.from(new Set([...sync.providers, id]))
      : sync.providers.filter((x) => x !== id);
    if (next.length === 0) return;
    if (next.length > 5) return;
    sync.setProviders(next);
    void sync.measure(next);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings2 />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>All preferences stay on this device.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-4">
          <BackgroundConsentRow />

          <Section title="Appearance">
            <Row label="Theme">
              <Select value={settings.theme} onValueChange={(v) => settings.update({ theme: v as Theme })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <span className="inline-flex items-center gap-2">
                      <Sun className="size-3.5" /> Light
                    </span>
                  </SelectItem>
                  <SelectItem value="grey">
                    <span className="inline-flex items-center gap-2">
                      <CloudSun className="size-3.5" /> Grey
                    </span>
                  </SelectItem>
                  <SelectItem value="dark">
                    <span className="inline-flex items-center gap-2">
                      <Moon className="size-3.5" /> Dark
                    </span>
                  </SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Digital hue">
              <Select
                value={settings.digitalHue}
                onValueChange={(v) => settings.update({ digitalHue: v as DigitalHue })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amber">Amber</SelectItem>
                  <SelectItem value="green">Green (phosphor)</SelectItem>
                  <SelectItem value="white">White</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section title="Clock face">
            <Row label="Face style">
              <Select value={settings.face} onValueChange={(v) => settings.update({ face: v as FaceId })}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FACES.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            {settings.face === "grandfather" && (
              <div className="space-y-2">
                <Label>Hour numerals</Label>
                <div className="grid grid-cols-3 gap-2">
                  {NUMERAL_OPTIONS.map((opt) => (
                    <NumeralPreviewButton
                      key={opt.id}
                      active={settings.grandfatherNumerals === opt.id}
                      label={opt.label}
                      onSelect={() =>
                        settings.update({
                          grandfatherNumerals: isValidNumeral(opt.id) ? opt.id : "roman",
                        })
                      }
                      preview={<GrandfatherFace showSeconds={false} numerals={opt.id} />}
                    />
                  ))}
                </div>
              </div>
            )}
            {settings.face === "midcentury" && (
              <div className="space-y-2">
                <Label>Hour numerals</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: true, label: "Numerals" },
                    { id: false, label: "None" },
                  ].map((opt) => (
                    <NumeralPreviewButton
                      key={String(opt.id)}
                      active={settings.midcenturyNumerals === opt.id}
                      label={opt.label}
                      onSelect={() => settings.update({ midcenturyNumerals: opt.id })}
                      preview={<MidCenturyFace showSeconds={false} numerals={opt.id} />}
                    />
                  ))}
                </div>
              </div>
            )}
            <Row label="24-hour time">
              <Switch checked={settings.hour24} onCheckedChange={(v) => settings.update({ hour24: v })} />
            </Row>
            <Row label="Show seconds">
              <Switch
                checked={settings.showSeconds}
                onCheckedChange={(v) => settings.update({ showSeconds: v })}
              />
            </Row>
            {settings.face === "digital-utc" && (
              <Row label="Show DOY / ISO week / Julian">
                <Switch
                  checked={settings.utcExtras}
                  onCheckedChange={(v) => settings.update({ utcExtras: v })}
                />
              </Row>
            )}
          </Section>

          <Section title="Chimes">
            <Row label="Sound set">
              <Select
                value={settings.soundSet}
                onValueChange={(v) => settings.update({ soundSet: v as SoundSet })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETS.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <div className="text-xs text-muted-foreground">
              {SETS.find((set) => set.id === settings.soundSet)?.note}
            </div>
            <div>
              <Button size="sm" variant="secondary" onClick={preview}>
                <Play />
                Preview quarter
              </Button>
            </div>
            <Row label="Quarter-hour chimes">
              <Switch
                checked={settings.chimeQuarters}
                onCheckedChange={(v) => settings.update({ chimeQuarters: v })}
              />
            </Row>
            <Row label="Hour strikes">
              <Switch
                checked={settings.chimeHour}
                onCheckedChange={(v) => settings.update({ chimeHour: v })}
              />
            </Row>
            <Row label={`Master volume — ${Math.round(settings.masterVolume * 100)}%`}>
              <Slider
                className="w-40"
                min={0}
                max={100}
                step={5}
                value={[Math.round(settings.masterVolume * 100)]}
                disabled={settings.soundMode === "mute"}
                onValueChange={([v]) => settings.update({ masterVolume: v / 100 })}
              />
            </Row>
            <Row label={`Chime speed — ${settings.chimeSpeed.toFixed(2)}×`}>
              <Slider
                className="w-40"
                min={50}
                max={400}
                step={25}
                value={[Math.round(settings.chimeSpeed * 100)]}
                onValueChange={([v]) => settings.update({ chimeSpeed: v / 100 })}
              />
            </Row>
            <Row label="Transpose (key)">
              <Select
                value={String(settings.transposeSemitones)}
                onValueChange={(v) => settings.update({ transposeSemitones: Number(v) })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPOSE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.semitones} value={String(opt.semitones)}>
                      <span className="inline-flex w-full items-center justify-between gap-3">
                        <span>{opt.key}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {opt.semitones === 0
                            ? "0 (default)"
                            : `${opt.semitones > 0 ? "+" : ""}${opt.semitones} ${
                                Math.abs(opt.semitones) === 1 ? "step" : "steps"
                              }`}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row
              label={`Chime lead — ${settings.chimeLeadMs > 0 ? "+" : ""}${settings.chimeLeadMs} ms`}
            >
              <div className="flex w-64 items-center gap-2">
                <Slider
                  className="flex-1"
                  min={-500}
                  max={2000}
                  step={5}
                  value={[settings.chimeLeadMs]}
                  onValueChange={([v]) => settings.update({ chimeLeadMs: v })}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    // Priming the AudioContext requires a user gesture on
                    // most browsers; the button click satisfies that.
                    await unlockAudio();
                    const measured = measureAudioLatencyMs();
                    if (measured === null) {
                      toast.error("Couldn't measure audio latency", {
                        description:
                          "Play a preview chime once, then try calibrating again.",
                      });
                      return;
                    }
                    settings.update({ chimeLeadMs: measured });
                    toast.success(`Chime drift calibrated: ${measured} ms lead`, {
                      description:
                        "Future chimes will fire this many milliseconds early so the sound lands on the quarter.",
                    });
                  }}
                >
                  Calibrate
                </Button>
              </div>
            </Row>
            <Row label={`Quiet ceiling — ${Math.round(settings.quietCeiling * 100)}%`}>
              <Slider
                className="w-40"
                min={5}
                max={40}
                step={1}
                value={[Math.round(settings.quietCeiling * 100)]}
                onValueChange={([v]) => settings.update({ quietCeiling: v / 100 })}
              />
            </Row>
            <Row label="Quiet hours">
              <Switch
                checked={settings.quietHoursEnabled}
                onCheckedChange={(v) => settings.update({ quietHoursEnabled: v })}
              />
            </Row>
            {settings.quietHoursEnabled && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>From</span>
                <HourPicker
                  value={settings.quietHoursStart}
                  onChange={(v) => settings.update({ quietHoursStart: v })}
                />
                <span>to</span>
                <HourPicker
                  value={settings.quietHoursEnd}
                  onChange={(v) => settings.update({ quietHoursEnd: v })}
                />
              </div>
            )}
          </Section>

          <Section title="Time providers">
            <div className="text-xs text-muted-foreground">
              Select one or more independent HTTPS time references. Time.now is preferred when
              available; other selected services provide fallback readings by latency.
            </div>
            <ul className="space-y-2">
              {PROVIDER_IDS.map((id) => (
                <ProviderRow
                  key={id}
                  id={id}
                  active={sync.providers.includes(id)}
                  live={sync.sources.find((s) => s.id === id)}
                  onToggle={toggleProvider}
                />
              ))}
            </ul>

          </Section>

          <Section title="Streaming (OBS)">
            <div className="text-xs text-muted-foreground">
              A chromeless, transparent render of the current face for OBS / Twitch Studio
              browser sources. Add a Browser Source pointing at the URL below (560×560 works
              well) — chimes still play from the main app.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-[11px]">
                /obs?face={settings.face}&transparent=1&size=520
              </code>
              <Button size="sm" variant="outline" onClick={() => copyObsUrl(settings.face)}>
                Copy URL
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`/obs?face=${settings.face}&transparent=1&size=520`} target="_blank" rel="noreferrer">
                  Open preview
                </a>
              </Button>
            </div>
          </Section>

          <Section title="Privacy">
            <div className="text-xs text-muted-foreground">
              This app collects no personal data. All preferences live in this browser's local
              storage.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadUserDataAsJson(
                    { settings, timeProviders: sync.providers },
                    "time-chime-my-data.json",
                  )
                }
              >
                Export my data
              </Button>
              <Button size="sm" variant="outline" onClick={clearAllLocalDataAndReload}>
                Delete all my data
              </Button>

            </div>
            <div className="text-xs">
              <a href="/privacy" className="underline">
                Privacy policy
              </a>
              {" · "}
              <a href="/terms" className="underline">
                Terms
              </a>
              {" · "}
              <a href="/support" className="underline">
                Support the developers
              </a>
            </div>
          </Section>

          <div className="text-center text-[11px] text-muted-foreground">
            Time Chime v{__APP_VERSION__}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Volume2 className="size-3.5 opacity-0" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function HourPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 24 }).map((_, i) => (
          <SelectItem key={i} value={String(i)}>
            {String(i).padStart(2, "0")}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
