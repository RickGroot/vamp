import { describe, it, expect } from 'vitest';
import { parseProgressionInput } from './import';
import { migrateProgression } from './db';

const song = (name: string) => ({
	name,
	tempo: 120,
	timeSignature: { numerator: 4, denominator: 4 },
	instrument: 'piano',
	groove: { pattern: 'block', bass: 'root', metronome: false, drums: 'pop' },
	bars: [{ slots: [{ chord: 'C', beats: 4 }] }]
});

describe('parseProgressionInput — accepted shapes', () => {
	it('a Vamp backup wrapper', () => {
		const json = JSON.stringify({ app: 'vamp', progressions: [song('A'), song('B')] });
		expect(parseProgressionInput(json).map((p) => p.name)).toEqual(['A', 'B']);
	});

	it('a bare { progressions: [...] } without the app tag', () => {
		const json = JSON.stringify({ progressions: [song('X')] });
		expect(parseProgressionInput(json)).toHaveLength(1);
	});

	it('a single progression object (no wrapper)', () => {
		const json = JSON.stringify(song('Solo'));
		const out = parseProgressionInput(json);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe('Solo');
	});

	it('a bare array of progressions', () => {
		const json = JSON.stringify([song('One'), song('Two')]);
		expect(parseProgressionInput(json)).toHaveLength(2);
	});

	it('an object with bars but no name still counts as a song', () => {
		const json = JSON.stringify({ bars: [{ slots: [{ chord: 'G', beats: 4 }] }] });
		expect(parseProgressionInput(json)).toHaveLength(1);
	});
});

describe('parseProgressionInput — tolerant of chatbot formatting', () => {
	it('strips a ```json code fence', () => {
		const json = '```json\n' + JSON.stringify({ app: 'vamp', progressions: [song('Fenced')] }) + '\n```';
		expect(parseProgressionInput(json)[0].name).toBe('Fenced');
	});

	it('strips a plain ``` fence', () => {
		const json = '```\n' + JSON.stringify(song('Plain')) + '\n```';
		expect(parseProgressionInput(json)[0].name).toBe('Plain');
	});

	it('slices JSON out of surrounding prose', () => {
		const json = `Sure! Here is your song:\n${JSON.stringify(song('Prose'))}\nEnjoy playing it!`;
		expect(parseProgressionInput(json)[0].name).toBe('Prose');
	});
});

describe('parseProgressionInput — rejects junk with a clear error', () => {
	it('empty input', () => {
		expect(() => parseProgressionInput('   ')).toThrow(/paste some JSON/i);
	});

	it('non-JSON text', () => {
		expect(() => parseProgressionInput('just some words, no braces')).toThrow(/not valid JSON/i);
	});

	it('valid JSON that is not a song', () => {
		expect(() => parseProgressionInput('{"foo":1,"bar":2}')).toThrow(/doesn't look like a Vamp song/i);
	});

	it('an empty progressions array', () => {
		expect(() => parseProgressionInput('{"app":"vamp","progressions":[]}')).toThrow(/No songs found/i);
	});
});

describe('parse → migrate produces a valid, playable progression', () => {
	it('fills ids + schemaVersion and preserves the chords', () => {
		const json = JSON.stringify({
			app: 'vamp',
			progressions: [
				{
					name: 'ii–V–I',
					tempo: 140,
					timeSignature: { numerator: 4, denominator: 4 },
					instrument: 'rhodes',
					groove: { pattern: 'block', bass: 'walking', metronome: false, drums: 'swing' },
					bars: [
						{ slots: [{ chord: 'Dm7', beats: 4 }] },
						{ slots: [{ chord: 'G7', beats: 4 }] },
						{ slots: [{ chord: 'Cmaj7', beats: 4 }] }
					]
				}
			]
		});
		const [p] = parseProgressionInput(json).map(migrateProgression);
		expect(p.schemaVersion).toBeTruthy();
		expect(typeof p.id).toBe('string');
		expect(p.name).toBe('ii–V–I');
		expect(p.tempo).toBe(140);
		expect(p.instrument).toBe('rhodes');
		expect(p.groove.bass).toBe('walking');
		expect(p.bars).toHaveLength(3);
		expect(p.bars.every((b) => typeof b.id === 'string')).toBe(true);
		expect(p.bars[0].slots[0].chord).toBe('Dm7');
		expect(p.bars[0].slots[0].beats).toBe(4);
	});

	it('coerces an out-of-range instrument / bad groove to safe defaults', () => {
		const [p] = parseProgressionInput(
			JSON.stringify({ name: 'Weird', instrument: 'kazoo', groove: { drums: 'polka' } })
		).map(migrateProgression);
		expect(p.instrument).toBe('piano');
		expect(p.groove.drums).toBe('none');
		expect(p.groove.bass).toBe('none');
	});
});

describe('migrateProgression — hostile/legacy values are made safe', () => {
	const migrate = (partial: Record<string, unknown>) => migrateProgression({ name: 'X', ...partial });

	it('clamps tempo: zero/negative fall back, out-of-range clamps', () => {
		expect(migrate({ tempo: 0 }).tempo).toBe(100);
		expect(migrate({ tempo: -100 }).tempo).toBe(100);
		expect(migrate({ tempo: 1e9 }).tempo).toBe(300);
		expect(migrate({ tempo: 5 }).tempo).toBe(20);
		expect(migrate({ tempo: 140 }).tempo).toBe(140);
	});

	it('keeps odd-but-real meters, rejects garbage numerator/denominator', () => {
		expect(migrate({ timeSignature: { numerator: 7, denominator: 8 } }).timeSignature).toEqual({
			numerator: 7,
			denominator: 8
		});
		expect(migrate({ timeSignature: { numerator: 1e9, denominator: 4 } }).timeSignature.numerator).toBe(4);
		expect(migrate({ timeSignature: { numerator: 0.5, denominator: 4 } }).timeSignature.numerator).toBe(1); // integerised
		expect(migrate({ timeSignature: { numerator: 4, denominator: 5 } }).timeSignature.denominator).toBe(4);
		expect(migrate({ timeSignature: { numerator: -3, denominator: 0 } }).timeSignature).toEqual({
			numerator: 4,
			denominator: 4
		});
	});

	it('bounds slot beats: zero/negative/huge fall back to 4', () => {
		const bars = (beats: number) => [{ slots: [{ chord: 'C', beats }] }];
		expect(migrate({ bars: bars(-4) }).bars[0].slots[0].beats).toBe(4);
		expect(migrate({ bars: bars(0) }).bars[0].slots[0].beats).toBe(4);
		expect(migrate({ bars: bars(1e12) }).bars[0].slots[0].beats).toBe(4);
		expect(migrate({ bars: bars(1.5) }).bars[0].slots[0].beats).toBe(1.5); // fractional is legit
	});

	it('migrates the legacy boolean groove.bass (pre-bass-modes saves)', () => {
		expect(migrate({ groove: { bass: true } }).groove.bass).toBe('root');
		expect(migrate({ groove: { bass: false } }).groove.bass).toBe('none');
	});
});
