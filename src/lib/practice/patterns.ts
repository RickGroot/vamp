// The shipped drill library.
//
// All original content built from general technical concepts — scale sequences,
// arpeggio shapes, interval cells — that are common musical property. Nothing is
// transcribed from Arban, Clarke, Quinque's ASA or any other copyrighted method.
// Users can build their own patterns on top of these (a later slice).

import { CURRENT_DRILL_SCHEMA_VERSION, type DrillDefinition, type DrillPattern } from './types';

const FOUR_FOUR = { numerator: 4, denominator: 4 } as const;

/**
 * Reusable cells, as 0-based POOL STEPS (see DrillPattern). `rhythm` cycles
 * against the cell, so a one-entry rhythm means "every note the same value".
 */
export const PATTERNS: Record<string, DrillPattern> = {
	steps: { id: 'steps', label: 'Straight up', cell: [0], rhythm: [1], step: 1 },
	thirds: { id: 'thirds', label: 'Thirds', cell: [0, 2], rhythm: [0.5], step: 1 },
	fourths: { id: 'fourths', label: 'Fourths', cell: [0, 3], rhythm: [0.5], step: 1 },
	'1235': { id: '1235', label: '1-2-3-5', cell: [0, 1, 2, 4], rhythm: [0.5], step: 1 },
	'1232': { id: '1232', label: '1-2-3-2', cell: [0, 1, 2, 1], rhythm: [0.5], step: 1 },
	turn: { id: 'turn', label: 'Turn (1-2-1-7)', cell: [0, 1, 0, -1], rhythm: [0.5], step: 1 },
	triad: { id: 'triad', label: 'Triad', cell: [0, 1, 2], rhythm: [0.5], step: 1 },
	seventh: { id: 'seventh', label: 'Seventh arpeggio', cell: [0, 1, 2, 3], rhythm: [0.5], step: 1 },
	'seventh-back': {
		id: 'seventh-back',
		label: 'Up and back',
		cell: [0, 1, 2, 3, 2, 1],
		rhythm: [0.5],
		step: 1
	}
};

const drill = (
	d: Omit<DrillDefinition, 'schemaVersion' | 'timeSignature' | 'builtIn' | 'createdAt' | 'updatedAt'> &
		Partial<Pick<DrillDefinition, 'timeSignature'>>
): DrillDefinition => ({
	schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
	timeSignature: FOUR_FOUR,
	builtIn: true,
	// The shipped library is never written to IndexedDB, so it carries no real
	// timestamps — 0 keeps the type honest without implying an edit history.
	createdAt: 0,
	updatedAt: 0,
	...d
});

export const BUILT_IN_DRILLS: DrillDefinition[] = [
	drill({
		id: 'scale-up',
		name: 'Scale, straight up',
		description: 'The plain scale, one note per beat. The warm-up everything else is built on.',
		source: { kind: 'scale', scaleType: 'major' },
		pattern: PATTERNS.steps,
		direction: 'updown',
		cellsPerKey: 8
	}),
	drill({
		id: 'scale-1235',
		name: '1-2-3-5 sequence',
		description: 'The classic four-note cell, moved up the scale one step at a time.',
		source: { kind: 'scale', scaleType: 'major' },
		pattern: PATTERNS['1235'],
		direction: 'up',
		cellsPerKey: 8
	}),
	drill({
		id: 'scale-thirds',
		name: 'Scale in thirds',
		description: 'Broken thirds up the scale — the interval your ear needs most.',
		source: { kind: 'scale', scaleType: 'major' },
		pattern: PATTERNS.thirds,
		direction: 'updown',
		cellsPerKey: 8
	}),
	drill({
		id: 'scale-turn',
		name: 'Turn figure',
		description: 'A four-note turn around each scale degree, for finger and tongue control.',
		source: { kind: 'scale', scaleType: 'major' },
		pattern: PATTERNS.turn,
		direction: 'up',
		cellsPerKey: 8
	}),
	drill({
		id: 'blues-1235',
		name: 'Blues cell',
		description: 'The 1-2-3-5 cell over the blues scale — the same shape, a different colour.',
		source: { kind: 'scale', scaleType: 'blues' },
		pattern: PATTERNS['1235'],
		direction: 'up',
		cellsPerKey: 6
	}),
	drill({
		id: 'pent-thirds',
		name: 'Pentatonic thirds',
		description: 'Broken thirds through the minor pentatonic — wide, and it sits well on a horn.',
		source: { kind: 'scale', scaleType: 'minor pentatonic' },
		pattern: PATTERNS.thirds,
		direction: 'updown',
		cellsPerKey: 5
	}),
	drill({
		id: 'maj7-arp',
		name: 'Major 7th arpeggio',
		description: 'Root, 3rd, 5th, 7th. Learn the chord from the inside out.',
		source: { kind: 'chord', quality: 'maj7' },
		pattern: PATTERNS.seventh,
		direction: 'updown',
		cellsPerKey: 3
	}),
	drill({
		id: 'm7-arp',
		name: 'Minor 7th arpeggio',
		description: 'The ii chord of every major key, through all twelve.',
		source: { kind: 'chord', quality: 'm7' },
		pattern: PATTERNS.seventh,
		direction: 'updown',
		cellsPerKey: 3
	}),
	drill({
		id: 'dom7-arp',
		name: 'Dominant 7th arpeggio',
		description: 'The chord that wants to resolve. Know it in every key before you need it.',
		source: { kind: 'chord', quality: '7' },
		pattern: PATTERNS.seventh,
		direction: 'updown',
		cellsPerKey: 3
	}),
	drill({
		id: 'dom7-back',
		name: 'Dominant, up and back',
		description: 'Up the seventh chord and back down through it — no landing on the top.',
		source: { kind: 'chord', quality: '7' },
		pattern: PATTERNS['seventh-back'],
		direction: 'up',
		cellsPerKey: 3
	}),
	drill({
		id: 'triad-major',
		name: 'Major triad',
		description: 'Three notes, every key. The simplest place to start.',
		source: { kind: 'chord', quality: '' },
		pattern: PATTERNS.triad,
		direction: 'updown',
		cellsPerKey: 3
	}),
	drill({
		id: 'm7b5-arp',
		name: 'Half-diminished arpeggio',
		description: 'The ii of a minor key — awkward under the fingers until it isn’t.',
		source: { kind: 'chord', quality: 'm7b5' },
		pattern: PATTERNS.seventh,
		direction: 'updown',
		cellsPerKey: 3
	})
];

/**
 * Drills that run over a chord SEQUENCE rather than a single key — they need
 * changes supplied in the run options (normally the editor's progression), so
 * they are listed apart from the key-cycling library above.
 */
export const GUIDE_TONE_DRILLS: DrillDefinition[] = [
	drill({
		id: 'guide-tones',
		name: 'Guide tones',
		description:
			'The 3rd and 7th of each chord, whichever is nearest — the line that spells the changes.',
		source: { kind: 'guide', line: 'guide' },
		pattern: PATTERNS.steps,
		direction: 'up',
		cellsPerKey: 1
	}),
	drill({
		id: 'guide-thirds',
		name: 'Thirds through the changes',
		description: 'Only the 3rds. Hear major turn to minor as the chords move.',
		source: { kind: 'guide', line: 'thirds' },
		pattern: PATTERNS.steps,
		direction: 'up',
		cellsPerKey: 1
	}),
	drill({
		id: 'guide-sevenths',
		name: 'Sevenths through the changes',
		description: 'Only the 7ths. The note that pulls each chord to the next.',
		source: { kind: 'guide', line: 'sevenths' },
		pattern: PATTERNS.steps,
		direction: 'up',
		cellsPerKey: 1
	}),
	drill({
		id: 'guide-roots',
		name: 'Roots through the changes',
		description: 'Just the roots — start here, then move to the guide tones.',
		source: { kind: 'guide', line: 'roots' },
		pattern: PATTERNS.steps,
		direction: 'up',
		cellsPerKey: 1
	})
];

export const ALL_DRILLS: DrillDefinition[] = [...BUILT_IN_DRILLS, ...GUIDE_TONE_DRILLS];

export const drillById = (id: string): DrillDefinition | undefined =>
	ALL_DRILLS.find((d) => d.id === id);

/** Whether a drill needs changes supplied (and so a song to run over). */
export const needsChords = (definition: DrillDefinition): boolean =>
	definition.source.kind === 'guide';
