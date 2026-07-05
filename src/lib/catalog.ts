/**
 * Shared display catalog for clock faces and chime sound sets.
 * Single source of truth for labels used across the settings drawer and homepage,
 * so a rename in one place can't drift out of sync with the other.
 */
import type { FaceId, SoundSet } from "@/lib/settings";

export const FACES: { id: FaceId; label: string }[] = [
  { id: "grandfather", label: "Grandfather" },
  { id: "midcentury", label: "Mid-Century Modern" },
  { id: "digital-local", label: "Digital · Local" },
  { id: "digital-utc", label: "Digital · UTC" },
];

export const SETS: { id: SoundSet; label: string; note: string }[] = [
  { id: "bell", label: "Church Bell", note: "Warm cast-bronze tower bell" },
  { id: "train", label: "Japanese Train", note: "Bright vibraphone jingle" },
  { id: "midi", label: "Pure MIDI", note: "Clinical synthesized voices" },
];

/** Homepage uses a shorter face label than the full drawer label. */
export const FACE_SHORT_LABEL: Record<FaceId, string> = {
  grandfather: "Grandfather",
  midcentury: "Mid-Century",
  "digital-local": "Digital · Local",
  "digital-utc": "Digital · UTC",
};

/** Homepage uses a shorter set label than the full drawer label. */
export const SET_SHORT_LABEL: Record<SoundSet, string> = {
  bell: "Church Bell",
  train: "Station Chime",
  midi: "Pure MIDI",
};
