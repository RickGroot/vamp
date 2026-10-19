// How a chord symbol is SET on screen, the way a Real Book prints it: the root
// large, the quality small and raised, a slash bass back at the root's size,
// accidentals as real ♭ / ♯. Display only — the stored symbol is always the
// literal string the user typed (see the "chords are literal" convention).

export interface ChordFace {
	/** Letter plus accidentals, e.g. 'B♭'. */
	root: string;
	/** Everything after the root and before a slash bass, e.g. 'm7♭5'. */
	quality: string;
	/** The slash bass note, e.g. 'E♭' for 'Cm7/Eb', or ''. */
	bass: string;
}

const accidentals = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');

/** In a quality, only a `b` before a degree is a flat ('m7b5', 'b9'); `#` is always sharp. */
const qualityAccidentals = (s: string) => s.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');

/**
 * Split a chord symbol into its printed parts, or null when it doesn't start
 * with a note name (a rest, or something we can't read — show it as typed).
 */
export function chordFace(symbol: string): ChordFace | null {
	const s = symbol.trim();
	const m = s.match(/^([A-G])([b#]{0,2})(.*)$/);
	if (!m) return null;
	const [, letter, acc, rest] = m;

	let quality = rest;
	let bass = '';
	const slash = rest.lastIndexOf('/');
	if (slash >= 0) {
		const after = rest.slice(slash + 1);
		// '6/9' is a quality, not a slash chord: only a note name after the slash is a bass.
		if (/^[A-G][b#]{0,2}$/.test(after)) {
			quality = rest.slice(0, slash);
			bass = after[0] + accidentals(after.slice(1));
		}
	}
	return { root: letter + accidentals(acc), quality: qualityAccidentals(quality), bass };
}

// ---- spoken form ------------------------------------------------------------
//
// What a screen reader should say for a chord symbol. The drawn face splits a
// symbol into a letter, an image of a flat and a raised quality, which reads as
// "E, flat, image, m 7". This is the sentence a musician would say instead.

const LETTER_ACCIDENTAL: Record<string, string> = { b: ' flat', bb: ' double flat', '#': ' sharp', '##': ' double sharp' };

/** Whole qualities with a name of their own, checked before reading word by word. */
const NAMED_QUALITIES: Record<string, string> = {
	'': 'major',
	M: 'major',
	maj: 'major',
	m: 'minor',
	min: 'minor',
	'-': 'minor',
	'7': 'seven',
	maj7: 'major seven',
	M7: 'major seven',
	ma7: 'major seven',
	'Δ': 'major seven',
	'Δ7': 'major seven',
	m7: 'minor seven',
	min7: 'minor seven',
	'-7': 'minor seven',
	m7b5: 'half-diminished',
	'ø': 'half-diminished',
	'ø7': 'half-diminished',
	dim: 'diminished',
	'°': 'diminished',
	o: 'diminished',
	dim7: 'diminished seven',
	'°7': 'diminished seven',
	o7: 'diminished seven',
	aug: 'augmented',
	'+': 'augmented',
	mMaj7: 'minor major seven',
	'm(maj7)': 'minor major seven',
	mM7: 'minor major seven',
	'6/9': 'six nine',
	'5': 'five'
};

const NUMBER_WORDS: Record<string, string> = {
	'2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven',
	'9': 'nine', '11': 'eleven', '13': 'thirteen'
};

/** Word-by-word reading for everything else ('maj7#11' → 'major seven sharp eleven'). */
const QUALITY_TOKENS: [RegExp, string][] = [
	[/^mMaj/, 'minor major'],
	[/^maj/, 'major'],
	[/^min/, 'minor'],
	[/^dim/, 'diminished'],
	[/^aug/, 'augmented'],
	[/^sus/, 'sus'],
	[/^add/, 'add'],
	[/^alt/, 'altered'],
	[/^m/, 'minor'],
	[/^M/, 'major'],
	[/^Δ/, 'major'],
	[/^ø/, 'half-diminished'],
	[/^[°o]/, 'diminished'],
	[/^\+/, 'augmented'],
	[/^-/, 'minor'],
	[/^b/, 'flat'],
	[/^#/, 'sharp']
];

function speakQuality(quality: string): string {
	if (Object.hasOwn(NAMED_QUALITIES, quality)) return NAMED_QUALITIES[quality];
	const words: string[] = [];
	let rest = quality.replace(/[()\s,]/g, '');
	while (rest) {
		const num = /^(13|11|\d)/.exec(rest);
		if (num) {
			words.push(NUMBER_WORDS[num[1]] ?? num[1]);
			rest = rest.slice(num[1].length);
			continue;
		}
		const token = QUALITY_TOKENS.find(([re]) => re.test(rest));
		if (token) {
			words.push(token[1]);
			rest = rest.replace(token[0], '');
			continue;
		}
		words.push(rest[0]); // unknown: say the character rather than drop it
		rest = rest.slice(1);
	}
	return words.join(' ');
}

const speakNote = (letter: string, acc: string) => letter + (LETTER_ACCIDENTAL[acc] ?? '');

/**
 * The spoken form of a chord symbol: 'Ebm7' → 'E flat minor seven', 'C/G' →
 * 'C major over G', 'G7b9' → 'G seven flat nine'. Returns the symbol as typed
 * when it isn't a chord (a rest, 'N.C.'). Display/AT only, like chordFace.
 */
export function spokenChord(symbol: string): string {
	const s = symbol.trim();
	const m = s.match(/^([A-G])([b#]{0,2})(.*)$/);
	if (!m) return s;
	const [, letter, acc, rest] = m;
	let quality = rest;
	let bass = '';
	const slash = rest.lastIndexOf('/');
	if (slash >= 0) {
		const bm = /^([A-G])([b#]{0,2})$/.exec(rest.slice(slash + 1));
		if (bm) {
			quality = rest.slice(0, slash);
			bass = ` over ${speakNote(bm[1], bm[2])}`;
		}
	}
	return `${speakNote(letter, acc)} ${speakQuality(quality)}${bass}`;
}
