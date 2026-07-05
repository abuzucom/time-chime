import { Bell, BellOff, BellRing } from "lucide-react";
import { useSettings, type SoundMode } from "@/lib/settings";
import { unlockAudio } from "@/lib/chimes/audio";
import { cn } from "@/lib/utils";

const options: { id: SoundMode; label: string; icon: typeof Bell; tone: string }[] = [
  { id: "normal", label: "Normal", icon: BellRing, tone: "var(--sound-normal)" },
  { id: "quiet", label: "Quiet", icon: Bell, tone: "var(--sound-quiet)" },
  { id: "mute", label: "Mute", icon: BellOff, tone: "var(--sound-mute)" },
];

/**
 * Pill-shaped three-way toggle for Normal / Quiet / Mute sound modes.
 * First interaction also calls `unlockAudio()` to satisfy browser
 * gesture-based autoplay policies for the WebAudio chime engine.
 */
export function SoundModeChip() {
  const settings = useSettings();
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border bg-card p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const active = settings.soundMode === option.id;
        return (
          <button
            key={option.id}
            onClick={() => {
              void unlockAudio();
              settings.update({ soundMode: option.id });
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              active ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            style={active ? { background: option.tone, color: "var(--sound-fg)" } : undefined}
            aria-pressed={active}
            title={`${option.label} — press ${option.id === "mute" ? "M" : option.id === "quiet" ? "Q" : "N"} to toggle`}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
