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
