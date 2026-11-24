import { describe, it, expect } from 'vitest';
import { Chord } from 'tonal';
import { ChordGesture, detectChordSymbol, dispatchMessage, gestureTarget, noteOnOf } from './input';

/** Parse the detected symbol back with tonal to assert root + quality robustly. */
const parse = (sym: string) => Chord.get(sym);

describe('detectChordSymbol', () => {
	it('C major triad (C E G)', () => {
		const sym = detectChordSymbol([60, 64, 67]);
		expect(sym).toBeTruthy();
		const c = parse(sym!);
		expect(c.tonic).toBe('C');
		expect(c.quality).toBe('Major');
	});

	it('D minor triad (D F A)', () => {
		const sym = detectChordSymbol([62, 65, 69]);
		const c = parse(sym!);
		expect(c.tonic).toBe('D');
		expect(c.quality).toBe('Minor');
	});

	it('G dominant 7 (G B D F)', () => {
		const sym = detectChordSymbol([55, 59, 62, 65]);
		const c = parse(sym!);
		expect(c.tonic).toBe('G');
		expect(c.aliases).toContain('7');
	});

	it('ignores fewer than two notes', () => {
		expect(detectChordSymbol([60])).toBeNull();
		expect(detectChordSymbol([])).toBeNull();
	});

	it('is octave/duplicate insensitive', () => {
		const sym = detectChordSymbol([67, 60, 64, 72]); // C E G + high C
		expect(parse(sym!).tonic).toBe('C');
	});
});

const on = (note: number, velocity = 100, channel = 0) => [0x90 | channel, note, velocity];
const off = (note: number, channel = 0) => [0x80 | channel, note, 64];

/** Feed messages in order; collect every gesture reported. */
function feed(g: ChordGesture, messages: number[][]) {
	return messages.map((m) => g.message(m)).filter((x) => x !== null);
}

describe('ChordGesture', () => {
	it('reports the peak set on full release, not before', () => {
		const g = new ChordGesture();
		expect(feed(g, [on(60), on(64), on(67), off(64), off(60)])).toEqual([]);
		const [done] = feed(g, [off(67)]);
		expect(done.notes).toEqual([60, 64, 67]);
		expect(parse(done.symbol!).tonic).toBe('C');
	});

	it('reports the notes ascending, whatever order they came in', () => {
		const g = new ChordGesture();
		const [done] = feed(g, [on(67), on(60), on(64), off(60), off(64), off(67)]);
		expect(done.notes).toEqual([60, 64, 67]);
	});

	it('a re-press before full release extends the same gesture', () => {
		const g = new ChordGesture();
		// C and E held, G tapped twice, then B added while C is still down.
		const out = feed(g, [on(60), on(64), on(67), off(67), on(67), off(64), on(71), off(67), off(71), off(60)]);
		expect(out).toHaveLength(1);
		expect(out[0].notes).toEqual([60, 64, 67, 71]);
		expect(out[0].symbol).toBe('Cmaj7');
	});

	it('starts a fresh gesture after a full release', () => {
		const g = new ChordGesture();
		const out = feed(g, [on(60), on(64), on(67), off(60), off(64), off(67), on(62), on(65), on(69), off(62), off(65), off(69)]);
		expect(out.map((x) => x.notes)).toEqual([
			[60, 64, 67],
			[62, 65, 69]
		]);
	});

	it('counts a velocity-0 note-on as a note-off (running status)', () => {
		const g = new ChordGesture();
		const out = feed(g, [on(55), on(59), on(62), on(65), on(55, 0), on(59, 0), on(62, 0)]);
		expect(out).toEqual([]);
		const [done] = feed(g, [on(65, 0)]);
		expect(done.notes).toEqual([55, 59, 62, 65]);
		expect(parse(done.symbol!).aliases).toContain('7');
	});

	it('listens on every channel and ignores everything that is not a note', () => {
		const g = new ChordGesture();
		const out = feed(g, [
			[0xf8], // clock
			[0xb0, 64, 127], // sustain pedal
			on(60, 90, 9),
			on(64, 90, 3),
			on(67),
			off(60, 9),
			off(64, 3),
			off(67)
		]);
		expect(out).toHaveLength(1);
		expect(out[0].notes).toEqual([60, 64, 67]);
	});

	it('reports a single note too, with no symbol (the caller decides)', () => {
		const g = new ChordGesture();
		expect(feed(g, [on(60), off(60)])).toEqual([{ notes: [60], symbol: null }]);
	});

	it('a disconnect (reset) clears held and peak notes', () => {
		const g = new ChordGesture();
		// C E G held, then the device is unplugged: no note-offs ever arrive.
		feed(g, [on(60), on(64), on(67)]);
		g.reset();
		// The next chord completes on its own release, and holds only its own notes.
		const out = feed(g, [on(62), on(65), on(69), off(62), off(65), off(69)]);
		expect(out).toHaveLength(1);
		expect(out[0].notes).toEqual([62, 65, 69]);
		// A stray note-off for a note forgotten by the reset reports nothing.
		expect(feed(g, [off(60)])).toEqual([]);
	});

	it('without the reset, an unplugged hold would swallow every later chord', () => {
		const g = new ChordGesture();
		feed(g, [on(60), on(64), on(67)]);
		expect(feed(g, [on(62), on(65), on(69), off(62), off(65), off(69)])).toEqual([]);
	});
});

describe('noteOnOf', () => {
	it('reads a note-on on any channel', () => {
		expect(noteOnOf(on(60))).toEqual({ note: 60, velocity: 100 });
		expect(noteOnOf(on(72, 1, 15))).toEqual({ note: 72, velocity: 1 });
	});
	it('is null for everything that is not a sounding note-on', () => {
		expect(noteOnOf(on(60, 0))).toBeNull();
		expect(noteOnOf(off(60))).toBeNull();
		expect(noteOnOf([0xb0, 64, 127])).toBeNull();
		expect(noteOnOf([0xe0, 0, 64])).toBeNull();
		expect(noteOnOf([0xf8])).toBeNull();
		expect(noteOnOf([0x90, 60])).toBeNull();
		expect(noteOnOf([0x90, 128, 100])).toBeNull();
		expect(noteOnOf([0x90, -1, 100])).toBeNull();
		expect(noteOnOf([0x90, 60.5, 100])).toBeNull();
		expect(noteOnOf([0x90, 60, NaN])).toBeNull();
	});
});

describe('dispatchMessage', () => {
	const setup = () => {
		const notes: [number, number][] = [];
		const gestures: unknown[] = [];
		const order: string[] = [];
		const sinks = {
			onNote: (n: number, t: number) => {
				notes.push([n, t]);
				order.push('note');
			},
			onGesture: (g: unknown) => {
				gestures.push(g);
				order.push('gesture');
			}
		};
		return { notes, gestures, order, sinks, g: new ChordGesture() };
	};

	it('hands each note-on its timestamp, in the order played', () => {
		const s = setup();
		dispatchMessage(on(64), 10, s.g, s.sinks);
		dispatchMessage(on(60), 20, s.g, s.sinks);
		dispatchMessage(on(67), 30, s.g, s.sinks);
		expect(s.notes).toEqual([[64, 10], [60, 20], [67, 30]]);
	});
	it('reports no note for a note-off, and still the gesture', () => {
		const s = setup();
		dispatchMessage(on(60), 1, s.g, s.sinks);
		dispatchMessage(off(60), 2, s.g, s.sinks);
		expect(s.notes).toHaveLength(1);
		expect(s.gestures).toHaveLength(1);
	});
	it('falls back to the injected clock for a zero timestamp', () => {
		const s = setup();
		dispatchMessage(on(60), 0, s.g, s.sinks, () => 777);
		expect(s.notes).toEqual([[60, 777]]);
	});
	it('works with no note sink', () => {
		const s = setup();
		dispatchMessage(on(60), 5, s.g, { onGesture: s.sinks.onGesture });
		dispatchMessage(off(60), 6, s.g, { onGesture: s.sinks.onGesture });
		expect(s.gestures).toHaveLength(1);
	});
	it('fires the note before the gesture', () => {
		const s = setup();
		dispatchMessage(on(60), 1, s.g, s.sinks);
		dispatchMessage(off(60), 2, s.g, s.sinks);
		expect(s.order).toEqual(['note', 'gesture']);
	});
});

describe('gestureTarget', () => {
	const gest = { notes: [60, 64, 67], symbol: 'C' };
	const none = { notes: [60], symbol: null };
	it('follows the precedence noter, captor, song, ignore', () => {
		expect(gestureTarget({ noter: true, captor: true }, gest)).toBe('swallow');
		expect(gestureTarget({ noter: false, captor: true }, none)).toBe('captor');
		expect(gestureTarget({ noter: false, captor: false }, gest)).toBe('song');
		expect(gestureTarget({ noter: false, captor: false }, none)).toBe('ignore');
	});
	it('with a note capture held, nothing reaches the song or a captor', () => {
		for (const captor of [true, false])
			for (const g of [gest, none]) {
				const t = gestureTarget({ noter: true, captor }, g);
				expect(t).not.toBe('song');
				expect(t).not.toBe('captor');
			}
	});
	it('is total over the whole product', () => {
		for (const noter of [true, false])
			for (const captor of [true, false])
				for (const g of [gest, none])
					expect(['swallow', 'captor', 'song', 'ignore']).toContain(gestureTarget({ noter, captor }, g));
	});
});
