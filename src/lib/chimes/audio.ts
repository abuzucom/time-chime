import {
  HOUR_BELL_MIDI,
  beatSeconds,
  hourStrikeGap,
  hourStrikeSeconds,
  phraseBeats,
  phraseNotes,
  type Phrase,
  type SoundSetId,
} from "./westminster";

let ctx: AudioContext | null = null;

/**
 * Lazily construct (and memoise) the process-wide `AudioContext`. Returns
 * `null` on SSR, in environments without the Web Audio API, or when the
 * browser refuses construction (autoplay policy, hardware exhaustion,
 * headless env). Callers must handle `null` and degrade gracefully — this
 * function never throws.
 */
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (err) {
      console.warn("[audio] failed to construct AudioContext", err);
      return null;
    }
  }
  return ctx;
}

/**
 * Tear down the shared AudioContext so the next `playPhrase` call rebuilds
 * it. Use this when playback has thrown — a fresh context typically clears
 * transient device / driver / autoplay-policy failures.
 */
export function resetAudioSubsystem(): void {
  if (!ctx) return;
  try {
    void ctx.close();
  } catch (err) {
    console.warn("[audio] failed to close AudioContext during reset", err);
  }
  ctx = null;
}

/** Resume the audio context (must be called from a user gesture). */
export async function unlockAudio(): Promise<void> {
  const audioCtx = getSharedAudioContext();
  if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
}

/**
 * Measure current audio output pipeline latency in milliseconds. Combines
 * `AudioContext.baseLatency` (buffering the browser adds before the audio
 * device) and `AudioContext.outputLatency` (device + OS mixer + wireless
 * transport delay before the listener hears it). `outputLatency` is not
 * implemented everywhere and is treated as 0 when missing.
 *
 * Returns `null` when no AudioContext is available (SSR, autoplay-blocked
 * before any user gesture, headless browser). Callers use this to derive
 * a `chimeLeadMs` correction so chimes are launched early enough for the
 * sound to arrive at the ear on the quarter boundary.
 */
export function measureAudioLatencyMs(): number | null {
  const audioCtx = getSharedAudioContext();
  if (!audioCtx) return null;
  const baseS = Number.isFinite(audioCtx.baseLatency) ? audioCtx.baseLatency : 0;
  const outS =
    typeof audioCtx.outputLatency === "number" && Number.isFinite(audioCtx.outputLatency)
      ? audioCtx.outputLatency
      : 0;
  const ms = Math.round((baseS + outS) * 1000);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  if (ms > 2000) return 2000;
  return ms;
}

/**
 * Coerce a value to a finite number, falling back to `fallback` when the input
 * is `NaN`, `±Infinity`, `undefined`, or otherwise not a real number. Used to
 * neutralise bad timing/speed/volume inputs before they reach Web Audio, which
 * throws `RangeError` on non-finite scheduling parameters.
 */
function safeFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Convert a MIDI note number to its frequency in hertz using the standard
 * equal-temperament formula anchored at A4 = MIDI 69 = 440 Hz. A non-finite
 * input falls back to A4 rather than propagating NaN into Web Audio.
 */
function midiNoteToFrequencyHz(midiNote: number): number {
  const midi = safeFinite(midiNote, 69);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Attach a subtle sine vibrato to an oscillator's frequency for the lifetime
 * of the note. Depth is a fraction of the carrier (e.g. 0.0025 = ±0.25%).
 */
function attachVibrato(
  audioCtx: AudioContext,
  osc: OscillatorNode,
  freq: number,
  when: number,
  dur: number,
  rateHz: number,
  depthFraction: number,
): void {
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = rateHz;
  // Delay full vibrato depth until the initial strike has spoken.
  const depth = freq * depthFraction;
  lfoGain.gain.setValueAtTime(0, when);
  lfoGain.gain.linearRampToValueAtTime(depth, when + Math.min(0.15, dur * 0.25));
  lfo.connect(lfoGain).connect(osc.frequency);
  lfo.start(when);
  lfo.stop(when + dur + 0.1);
}

/**
 * Relative amplitude ratios for the six sine partials that make up a struck
 * bell tone (sub-octave, fundamental, octave, minor-tenth "hum", twelfth,
 * double-octave). Hoisted to module scope so we don't reallocate this
 * six-element array on every note strike (a single chime can schedule ~30
 * notes; without this we'd churn ~180 short-lived objects per phrase).
 * `decayFactor` is multiplied by the note's target `dur` at play time.
 */
const BELL_PARTIALS: ReadonlyArray<{ ratio: number; gain: number; decayFactor: number }> = [
  { ratio: 0.5, gain: 0.35, decayFactor: 1.4 },
  { ratio: 1.0, gain: 0.7, decayFactor: 1.0 },
  { ratio: 2.0, gain: 0.3, decayFactor: 0.8 },
  { ratio: 2.4, gain: 0.15, decayFactor: 0.6 },
  { ratio: 3.0, gain: 0.1, decayFactor: 0.5 },
  { ratio: 4.0, gain: 0.05, decayFactor: 0.4 },
];

/**
 * Struck-bell voice: schedules six sine partials (0.5×, 1×, 2×, 2.4×, 3×, 4×
 * the fundamental) with fast attacks and staggered exponential decays, plus a
 * slow tower-bell shimmer via {@link attachVibrato}. Connects into `out` and
 * returns nothing; the oscillators clean themselves up after `dur`.
 */
function playBellNote(
  audioCtx: AudioContext,
  out: GainNode,
  freq: number,
  when: number,
  dur: number,
): void {
  for (const partial of BELL_PARTIALS) {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const partialFreq = freq * partial.ratio;
    const decay = dur * partial.decayFactor;
    osc.type = "sine";
    osc.frequency.value = partialFreq;
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(partial.gain, when + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(gainNode).connect(out);
    // Slow, tower-bell shimmer (~4.5 Hz, ±0.15%).
    attachVibrato(audioCtx, osc, partialFreq, when, decay, 4.5, 0.0015);
    osc.start(when);
    osc.stop(when + decay + 0.05);
  }
}

/**
 * Japanese-train-station vibraphone voice: a sine fundamental plus a quieter
 * triangle octave, both shaped with a fast attack and exponential decay and
 * given a brighter ~6 Hz mallet vibrato.
 */
function playTrainNote(
  audioCtx: AudioContext,
  out: GainNode,
  freq: number,
  when: number,
  dur: number,
): void {
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = "sine";
  osc2.type = "triangle";
  osc.frequency.value = freq;
  osc2.frequency.value = freq * 2;
  gainNode.gain.setValueAtTime(0, when);
  gainNode.gain.linearRampToValueAtTime(0.5, when + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gainNode);
  const gainNode2 = audioCtx.createGain();
  gainNode2.gain.setValueAtTime(0.15, when);
  gainNode2.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.6);
  osc2.connect(gainNode2);
  gainNode.connect(out);
  gainNode2.connect(out);
  // Faster, brighter vibrato on the mallet voice (~6 Hz, ±0.2%).
  attachVibrato(audioCtx, osc, freq, when, dur, 6.0, 0.002);
  attachVibrato(audioCtx, osc2, freq * 2, when, dur * 0.6, 6.0, 0.002);
  osc.start(when);
  osc2.start(when);
  osc.stop(when + dur + 0.05);
  osc2.stop(when + dur + 0.05);
}

/**
 * Pure-MIDI synth voice: a single square-wave oscillator with a short attack,
 * a brief plateau, and an exponential release, plus a classic ~5.5 Hz vibrato.
 * Emulates a hardware-synth "bell" patch rather than an acoustic instrument.
 */
function playMidiNote(
  audioCtx: AudioContext,
  out: GainNode,
  freq: number,
  when: number,
  dur: number,
): void {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, when);
  gainNode.gain.linearRampToValueAtTime(0.2, when + 0.005);
  gainNode.gain.setValueAtTime(0.2, when + dur * 0.8);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gainNode).connect(out);
  // Classic synth-style vibrato (~5.5 Hz, ±0.3%).
  attachVibrato(audioCtx, osc, freq, when, dur, 5.5, 0.003);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

/**
 * Signature shared by every sound-set voice: schedule one note of frequency
 * `freq` Hz starting at Web-Audio time `when` with a total ring-out of
 * `dur` seconds, routed into the shared `out` bus.
 */
type NotePlayer = (
  audioCtx: AudioContext,
  out: GainNode,
  freq: number,
  when: number,
  dur: number,
) => void;

/**
 * Resolve the {@link NotePlayer} for a sound set. All three players share
 * the same signature so callers can treat the return value uniformly.
 */
function notePlayerForSoundSet(setId: SoundSetId): NotePlayer {
  return setId === "bell" ? playBellNote : setId === "train" ? playTrainNote : playMidiNote;
}





export type PlayOptions = {
  setId: SoundSetId;
  volume: number; // 0..1
  /** Playback rate multiplier (1 = normal, 2 = twice as fast). */
  speed?: number;
  /** Whole-semitone transposition applied to every bell (0 = E major). */
  transpose?: number;
  /** Hour count for the strike (1-12). Ignored for quarter phrases. */
  hourCount?: number;
  /**
   * Optional feedback-delay send. `timeMs` sets the tap length, `feedback` is
   * the loop-gain (0..0.9), and `mix` (0..1) is the wet-signal level added on
   * top of the dry voice. Omit for a dry signal.
   */
  delay?: { timeMs: number; feedback: number; mix: number };
};

/**
 * Common setup shared by {@link playPhrase} and {@link playMelody}: acquires
 * the AudioContext (resuming it if the user gesture unlocked it after
 * suspension), creates the master gain node routed to `destination`, and
 * normalises the three shared `PlayOptions` numerics (volume, speed,
 * transpose) into safe finite values.
 *
 * Returns `null` when the audio subsystem is unavailable so callers can
 * short-circuit with a single guard.
 */
async function initPlaybackSession(opts: PlayOptions): Promise<{
  audioCtx: AudioContext;
  master: GainNode;
  voice: NotePlayer;
  speed: number;
  transpose: number;
} | null> {
  const audioCtx = getSharedAudioContext();
  if (!audioCtx) return null;
  if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
  const master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  master.gain.value = Math.max(0, Math.min(1, safeFinite(opts.volume, 0.6)));
  // Clamp AND normalize non-finite (NaN / ±Infinity) inputs so no divisor can be 0 or NaN.
  const speed = Math.min(8, Math.max(0.25, safeFinite(opts.speed, 1)));
  const transpose = Math.max(-24, Math.min(24, Math.round(safeFinite(opts.transpose, 0))));
  return { audioCtx, master, voice: notePlayerForSoundSet(opts.setId), speed, transpose };
}

/**
 * Play a Westminster phrase now (or the hour bell).
 *
 * Resolves to `true` when playback was successfully scheduled, or `false`
 * when the audio subsystem is unavailable or a Web Audio call threw. The
 * boolean lets the scheduler decide whether to reset the context and retry.
 * Never rejects — all errors are caught and logged.
 */
export async function playPhrase(phrase: Phrase, opts: PlayOptions): Promise<boolean> {
  try {
    const session = await initPlaybackSession(opts);
    if (!session) return false;
    const { audioCtx, master, voice, speed, transpose } = session;
    const bus = master;
    const start = audioCtx.currentTime + 0.05;

    // Safe scheduler: guarantees Web Audio only ever sees finite freq/when/dur.
    const scheduleNote = (freq: number, when: number, dur: number): void => {
      const safeFreq = Math.max(20, Math.min(20000, safeFinite(freq, 440)));
      const safeWhen = Math.max(audioCtx.currentTime, safeFinite(when, audioCtx.currentTime + 0.05));
      const safeDur = Math.max(0.05, Math.min(30, safeFinite(dur, 0.5)));
      voice(audioCtx, bus, safeFreq, safeWhen, safeDur);
    };

    if (phrase === "hour") {
      const count = Math.max(1, Math.min(12, Math.round(safeFinite(opts.hourCount, 1))));
      const dur = safeFinite(hourStrikeSeconds(opts.setId), 1.6) / speed;
      const gap = safeFinite(hourStrikeGap(opts.setId), 1.8) / speed;
      const freq = midiNoteToFrequencyHz(HOUR_BELL_MIDI + transpose);
      for (let i = 0; i < count; i++) {
        scheduleNote(freq, start + i * gap, dur);
      }
      return true;
    }

    // Quarter phrase — 3 crotchets + 1 minim per change, changes back-to-back.
    const notes = phraseNotes(phrase);
    const beat = safeFinite(beatSeconds(opts.setId), 0.5) / speed;
    let when = start;
    for (const note of notes) {
      const beats = safeFinite(note.beats, 1);
      const dur = beats * beat;
      scheduleNote(midiNoteToFrequencyHz(note.midi + transpose), when, dur);
      when += dur;
    }
    return true;
  } catch (err) {
    // Web Audio can throw for stopped/closed context, exhausted voices, or
    // scheduling a param at a non-finite time. Surface for debugging; the
    // caller (scheduler) can reset the subsystem and retry.
    console.warn("[audio] playPhrase failed", err);
    return false;
  }
}

/**
 * Play an arbitrary melody through one of the bell voices — used for the
 * Konami-code easter egg (Toccata & Fugue opening) and any future non-
 * Westminster stingers. Notes are `{ midi, dur }` pairs in seconds; the
 * sequence is scheduled back-to-back starting ~50ms in the future.
 */
export async function playMelody(
  notes: readonly { midi: number; dur: number }[],
  opts: PlayOptions,
): Promise<boolean> {
  try {
    const session = await initPlaybackSession(opts);
    if (!session) return false;
    const { audioCtx, master, voice, speed, transpose } = session;

    // Optional feedback-delay send: voices write to `bus`, which fans out
    // dry into `master` and wet through a delay->feedback->wet-gain loop.
    let bus: GainNode = master;
    if (opts.delay) {
      bus = audioCtx.createGain();
      bus.connect(master); // dry path
      const delayNode = audioCtx.createDelay(2.0);
      const feedback = audioCtx.createGain();
      const wet = audioCtx.createGain();
      delayNode.delayTime.value = Math.max(0.01, Math.min(2, opts.delay.timeMs / 1000));
      feedback.gain.value = Math.max(0, Math.min(0.9, opts.delay.feedback));
      wet.gain.value = Math.max(0, Math.min(1, opts.delay.mix));
      bus.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      delayNode.connect(wet);
      wet.connect(master);
    }

    let when = audioCtx.currentTime + 0.05;
    for (const note of notes) {
      const dur = Math.max(0.05, Math.min(8, safeFinite(note.dur, 0.4))) / speed;
      const freq = midiNoteToFrequencyHz(note.midi + transpose);
      voice(audioCtx, bus, freq, when, dur);
      when += dur;
    }
    return true;
  } catch (err) {
    console.warn("[audio] playMelody failed", err);
    return false;
  }
}

/** Total duration of a phrase in seconds — used by the scheduler for hour-strike offset. */
export function phraseDurationSeconds(
  phrase: Phrase,
  setId: SoundSetId,
  hourCount = 0,
  speed = 1,
): number {
  const clampedSpeed = Math.min(8, Math.max(0.25, safeFinite(speed, 1)));
  if (phrase === "hour") {
    const count = Math.max(1, Math.min(12, Math.round(safeFinite(hourCount, 0))));
    const strikeLen = safeFinite(hourStrikeSeconds(setId), 1.6);
    const strikeGap = safeFinite(hourStrikeGap(setId), 1.8);
    return (strikeGap * Math.max(0, count - 1) + strikeLen) / clampedSpeed;
  }
  const beats = safeFinite(phraseBeats(phrase), 5);
  const beat = safeFinite(beatSeconds(setId), 0.5);
  return (beats * beat) / clampedSpeed;
}
