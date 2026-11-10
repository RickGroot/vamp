// LickDefinition + options → LickRun: the lick in every key of the run, with
// the band's changes unrolled beside it.
//
// Mirrors practice/resolve.ts on purpose — the same key plan, the same single
// offset seam, the same "spell first, MIDI from the name, whole-octave fit"
// rules — so the runner, the staff and drillPlan read a lick exactly like a
// drill. What differs:
//   - the notes are a fixed line of degree tokens (tokens.ts), not a pool walk;
//   - the lick carries its own CHANGES (numerals), resolved per key into
//     concert symbols for the band, and into written symbols on each note for
//     the staff's chord names;
//   - every repetition is padded to a barline, lead and chords alike, so the
//     band's bars and the line stay aligned however long the lick is.
//
// Pure: tonal, model and practice siblings only. No tone, no stores.

import { Interval, Note } from 'tonal';
import { displayChord } from '$lib/audio/transpose';
import { barBeats, beatsToQuarters } from '$lib/model/time';
import { numeralToChord } from '$lib/model/numerals';
import { fitOctave } from '$lib/practice/range';
import { buildRunPlan } from '$lib/practice/sequence';
import type {
	DrillChord,
	DrillNote,
	DrillPhrase,
	DrillRunOptions,
	RangeFailure
} from '$lib/practice/types';
import { isRestToken, tokenLabel, tokenRole, tokenToNote } from './tokens';
import type { LickChord, LickDefinition, LickRun } from './types';

const EPS = 1e-9;
const positive = (n: number) => Number.isFinite(n) && n > 0;

/** The lick's length in beats: its changes, or (with none) one pass of its notes. */
export function lickBeats(lick: LickDefinition): number {
	const changes = lick.changes.filter((c) => positive(c.beats));
	if (changes.length) return changes.reduce((sum, c) => sum + c.beats, 0);
	const rhythm = lick.rhythm.filter(positive);
	const r = rhythm.length ? rhythm : [1];
	return lick.notes.reduce((sum, _, i) => sum + r[i % r.length], 0);
}

/** That length rounded UP to whole bars — where the next repetition starts. */
export function paddedBeats(lick: LickDefinition): number {
	const bar = barBeats(lick.timeSignature);
	return Math.max(1, Math.ceil(lickBeats(lick) / bar - EPS)) * bar;
}

/**
 * Split chords at barlines (same symbol on both sides), so a chord never
 * crosses one. learn/plan's `packBars` would otherwise close the bar early and
 * push the chord into the next — the band a beat away from the line.
 */
function tileBars(chords: DrillChord[], bar: number): DrillChord[] {
	const out: DrillChord[] = [];
	let used = 0;
	for (const chord of chords) {
		let remaining = chord.beats;
		while (remaining > EPS) {
			const take = Math.min(remaining, bar - used);
			out.push({ symbol: chord.symbol, beats: take });
			remaining -= take;
			used += take;
			if (bar - used <= EPS) used = 0;
		}
	}
	return out;
}

/** The changes in one key, as CONCERT symbols ('' where a numeral can't be read). */
export function lickChords(changes: LickChord[], concertTonic: string, mode: LickDefinition['mode']): DrillChord[] {
	return changes
		.filter((c) => positive(c.beats))
		.map((c) => ({
			symbol: numeralToChord(c.numeral, { tonic: concertTonic, mode }) ?? '',
			beats: c.beats
		}));
}

/** The concert symbol sounding at `beat` within one pass of `chords`. */
function chordAt(chords: DrillChord[], beat: number): string {
	let at = 0;
	for (const c of chords) {
		if (beat < at + c.beats - EPS) return c.symbol;
		at += c.beats;
	}
	return '';
}

export function resolveLick(lick: LickDefinition, options: DrillRunOptions): LickRun {
	// A lick is written in its own meter; the song's (options.timeSignature, set
	// for drills over your changes) never applies. Stored on the run's options
	// so `runMeter` — the click, the bar length, the staff — agrees.
	const ts = lick.timeSignature;
	const runOptions: DrillRunOptions = { ...options, timeSignature: ts };
	const bar = barBeats(ts);
	const q = (beats: number) => beatsToQuarters(beats, ts);
	const length = lickBeats(lick);
	const padded = paddedBeats(lick);
	const restBeats = Math.max(0, Math.floor(options.restBars)) * bar;
	const rhythm = lick.rhythm.filter(positive);
	const durations = rhythm.length ? rhythm : [1];

	const plan = buildRunPlan({
		root: options.root,
		keyMode: options.keyMode,
		reps: options.reps,
		tempo: options.tempo,
		tempoStep: options.tempoStep,
		tempoMax: options.tempoMax,
		rand: options.rand
	});

	const notes: DrillNote[] = [];
	const chords: DrillChord[] = [];
	const phrases: DrillPhrase[] = [];
	const skipped: { concertRoot: string; reason: RangeFailure }[] = [];
	let cursor = 0;
	let rep = 0;

	for (let i = 0; i < plan.roots.length; i++) {
		const concertRoot = plan.roots[i];
		// The offset is applied HERE and nowhere else.
		const writtenRoot = options.offset
			? Note.simplify(Note.transpose(concertRoot, Interval.fromSemitones(options.offset)))
			: concertRoot;
		const keyChords = lickChords(lick.changes, concertRoot, lick.mode);

		// The line, cut where the changes end. Spell first, MIDI from the name.
		const line: { token: string; name: string | null; beat: number; beats: number }[] = [];
		let beat = 0;
		for (let n = 0; n < lick.notes.length && beat < length - EPS; n++) {
			const token = lick.notes[n];
			const beats = Math.min(durations[n % durations.length], length - beat);
			const name = isRestToken(token) ? null : tokenToNote(token, writtenRoot);
			line.push({ token, name, beat, beats });
			beat += beats;
		}

		const sounding = line.filter((l) => l.name !== null);
		if (sounding.length === 0) {
			skipped.push({ concertRoot, reason: 'unresolvable' });
			continue;
		}
		const fitted = fitOctave(
			sounding.map((l) => Note.midi(l.name as string) ?? 60),
			options.range,
			options.register
		);
		if (!fitted.fit) {
			skipped.push({ concertRoot, reason: fitted.reason });
			continue;
		}

		const startQuarters = cursor;
		let s = 0;
		for (const l of line) {
			const concert = chordAt(keyChords, l.beat);
			const chord = concert ? displayChord(concert, options.offset) : undefined;
			notes.push({
				midi: l.name === null ? null : fitted.midis[s++],
				// Pitch class only, matching VoicedNote — the octave lives in `midi`.
				name: l.name === null ? '' : Note.get(l.name).pc,
				atQuarters: cursor,
				durQuarters: q(l.beats),
				label: l.name === null ? '' : tokenLabel(l.token),
				role: l.name === null ? 'rest' : tokenRole(l.token),
				rep,
				chord
			});
			cursor += q(l.beats);
		}
		// To the barline: the line may end before the changes, and the changes
		// before the bar does.
		const tail = padded - beat;
		if (tail > EPS) {
			notes.push({ midi: null, name: '', atQuarters: cursor, durQuarters: q(tail), label: '', role: 'rest', rep });
			cursor += q(tail);
		}
		chords.push(...tileBars(keyChords, bar));
		const chordTail = padded - keyChords.reduce((sum, c) => sum + c.beats, 0);
		if (chordTail > EPS) chords.push({ symbol: '', beats: chordTail });

		// Rest between repetitions: the band rests with you.
		if (restBeats > 0 && i < plan.roots.length - 1) {
			notes.push({ midi: null, name: '', atQuarters: cursor, durQuarters: q(restBeats), label: '', role: 'rest', rep });
			chords.push({ symbol: '', beats: restBeats });
			cursor += q(restBeats);
		}

		phrases.push({
			rep,
			concertRoot,
			writtenRoot,
			tempo: plan.tempos[i],
			startQuarters,
			lengthQuarters: cursor - startQuarters
		});
		rep++;
	}

	return { definition: lick, options: runOptions, notes, chords, phrases, totalQuarters: cursor, skipped };
}
