/**
 * Westminster Quarters — authoritative encoding.
 *
 * Rung in E major on the four quarter bells of the Elizabeth Tower, using the
 * five canonical "changes" (permutations) of the four pitches:
 *
 *   G♯4, F♯4, E4, B3   (E major)
 *
 * The five changes, numbered 1–5:
 *
 *   1: G♯4  F♯4  E4  B3
 *   2: E4   G♯4  F♯4 B3
 *   3: E4   F♯4  G♯4 E4
 *   4: G♯4  E4   F♯4 B3
 *   5: B3   F♯4  G♯4 E4
 *
 * Metre: 5/4 — each change is exactly one measure of five crotchet beats,
 * spelled as THREE crotchets (quarter notes) followed by ONE minim (half note).
 * Successive changes within one strike run back-to-back with no extra pause.
 *
 * Quarter-hour schedule (once per hour):
 *   :15  → change 1                    (1 measure  =  5 beats)
 *   :30  → changes 2, 3                (2 measures = 10 beats)
 *   :45  → changes 4, 5, 1             (3 measures = 15 beats)
 *   :00  → changes 2, 3, 4, 5          (4 measures = 20 beats)
 *          followed, after a pause, by one hour-bell strike per hour
 *          (12-hour reckoning: 1..12).
 */

// MIDI note numbers, E major on the great bells.
const E4 = 64;
const FS4 = 66;
const GS4 = 68;
const B3 = 59;

/** One of the five canonical Westminster changes. */
export type ChangeId = 1 | 2 | 3 | 4 | 5;

/** The five permutations, indexed 1..5 (index 0 intentionally unused). */
export const CHANGES: Record<ChangeId, readonly number[]> = {
  1: [GS4, FS4, E4, B3],
  2: [E4, GS4, FS4, B3],
  3: [E4, FS4, GS4, E4],
  4: [GS4, E4, FS4, B3],
  5: [B3, FS4, GS4, E4],
};

/** The change sequence played at each quarter boundary. */
export const QUARTER_SEQUENCE: Record<"q1" | "q2" | "q3" | "q4", readonly ChangeId[]> = {
  q1: [1],
  q2: [2, 3],
  q3: [4, 5, 1],
  q4: [2, 3, 4, 5],
};

export type Phrase = "q1" | "q2" | "q3" | "q4" | "hour";

/** A single scheduled note: MIDI pitch and length in beats (crotchet = 1). */
export type ScheduledNote = { midi: number; beats: number };

/**
 * Expand a phrase into its notes with correct rhythm — 3 crotchets + 1 minim
 * per change, back-to-back for multi-change phrases.
 */
export function phraseNotes(phrase: Exclude<Phrase, "hour">): ScheduledNote[] {
  const seq = QUARTER_SEQUENCE[phrase];
  const out: ScheduledNote[] = [];
  for (const id of seq) {
    const change = CHANGES[id];
    for (let i = 0; i < change.length; i++) {
      out.push({ midi: change[i], beats: i === change.length - 1 ? 2 : 1 });
    }
  }
  return out;
}

/** Total length of a quarter phrase, in beats (crotchets). */
export function phraseBeats(phrase: Exclude<Phrase, "hour">): number {
  // 5 beats per change (1+1+1+2).
  return QUARTER_SEQUENCE[phrase].length * 5;
}

/**
 * The deep tolling hour bell — a separate, lower voice one octave below the
 * tenor quarter bell (E2 = MIDI 40, matching Big Ben's own low E).
 */
export const HOUR_BELL_MIDI = 40;

/**
 * Transposition catalog — the user can shift every bell up or down by a
 * whole number of semitones. Zero means "as Big Ben rings, in E major".
 *
 * The chosen range (−5 … +6) covers every one of the twelve major keys
 * exactly once, using the shortest signed interval from E.
 */
export type TransposeOption = {
  semitones: number;
  key: string; // e.g. "F♯ major"
  label: string; // e.g. "F♯ major  ·  +2"
};

const KEY_NAMES: readonly string[] = [
  "E", "F", "F♯", "G", "A♭", "A", "B♭", "B", "C", "D♭", "D", "E♭",
];

export const TRANSPOSE_OPTIONS: readonly TransposeOption[] = (() => {
  const out: TransposeOption[] = [];
  for (let n = -5; n <= 6; n++) {
    const key = `${KEY_NAMES[((n % 12) + 12) % 12]} major`;
    const step = n === 0 ? "0" : n > 0 ? `+${n}` : `${n}`;
    out.push({ semitones: n, key, label: `${key}  ·  ${step}` });
  }
  return out;
})();

/**
 * Convert a signed semitone offset from the E-major base into a display name.
 * @param semitones Signed semitone offset (canonically −5 … +6).
 * @returns Human-readable major key, e.g. `"F♯ major"`; wraps chromatically
 *          so negative values return the correct enharmonic name.
 */
export function keyNameForSemitones(semitones: number): string {
  const chromaticIndex = ((semitones % 12) + 12) % 12;
  return `${KEY_NAMES[chromaticIndex]} major`;
}

export type SoundSetId = "bell" | "train" | "midi";

/**
 * Per-sound-set timing table. Big Ben's own tempo is roughly one crotchet every
 * ~2 s; the brighter voices feel wrong that slow, so we scale per set.
 *   beat       — length of one crotchet (quarter-note beat), in seconds
 *   strikeLen  — length of one hour-bell strike, in seconds
 *   strikeGap  — gap between successive hour strikes (strike-to-strike), in seconds
 */
const SOUND_SET_TIMING: Record<SoundSetId, { beat: number; strikeLen: number; strikeGap: number }> = {
  bell:  { beat: 1.0,     strikeLen: 2.375, strikeGap: 2.625  },
  train: { beat: 0.34375, strikeLen: 1.0,   strikeGap: 0.875  },
  midi:  { beat: 0.46875, strikeLen: 0.75,  strikeGap: 0.6875 },
};

/**
 * Length of one crotchet (quarter-note beat) in seconds for the given
 * sound set. Every rhythmic value in a Westminster phrase is expressed as
 * a multiple of this beat, so callers scale the whole phrase by picking
 * the per-set value from {@link SOUND_SET_TIMING}.
 */
export const beatSeconds = (setId: SoundSetId): number => SOUND_SET_TIMING[setId].beat;

/**
 * Sustain length (in seconds) of a single hour-bell strike for the given
 * sound set. Used to size the note's envelope so the tail doesn't overlap
 * the following strike.
 */
export const hourStrikeSeconds = (setId: SoundSetId): number => SOUND_SET_TIMING[setId].strikeLen;

/**
 * Gap between successive hour-bell strikes (in seconds, strike-to-strike)
 * for the given sound set. Combined with {@link hourStrikeSeconds} this
 * determines total hour-bell duration = `n × (strikeLen + strikeGap)`.
 */
export const hourStrikeGap = (setId: SoundSetId): number => SOUND_SET_TIMING[setId].strikeGap;
