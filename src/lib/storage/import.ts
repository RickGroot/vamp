// Forgiving parser for imported / pasted progression JSON.
//
// Accepts any of: a Vamp backup ({ app: 'vamp', progressions: [...] }), a bare
// { progressions: [...] }, a single progression object, or an array of
// progressions — and tolerates markdown code fences or surrounding prose (e.g.
// text copied straight out of a chatbot). Pure + unit-tested; the caller
// migrates each raw record via migrateProgression() and stores it.

/** Raw (un-migrated) progression records extracted from arbitrary pasted text. */
export function parseProgressionInput(text: string): Record<string, unknown>[] {
	if (!text || !text.trim()) throw new Error('Nothing to import — paste some JSON first.');
	const data = parseLoose(text);
	const list = normalise(data);
	if (list.length === 0) throw new Error('No songs found in that JSON.');
	return list;
}

/** JSON.parse, but first strip code fences and, failing that, slice out the
 *  first bracketed span so prose around the JSON doesn't break it. */
function parseLoose(text: string): unknown {
	const stripped = stripFences(text);
	const direct = tryJson(stripped);
	if (direct !== undefined) return direct;

	const start = firstBracket(stripped);
	const end = lastBracket(stripped);
	if (start !== -1 && end > start) {
		const sliced = tryJson(stripped.slice(start, end + 1));
		if (sliced !== undefined) return sliced;
	}
	throw new Error('That text is not valid JSON.');
}

function stripFences(text: string): string {
	let t = text.trim();
	if (t.startsWith('```')) {
		t = t
			.replace(/^```[a-zA-Z0-9]*\s*/, '')
			.replace(/```\s*$/, '')
			.trim();
	}
	return t;
}

function tryJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined; // valid JSON never parses to undefined, so this is unambiguous
	}
}

function firstBracket(t: string): number {
	const a = t.indexOf('{');
	const b = t.indexOf('[');
	if (a === -1) return b;
	if (b === -1) return a;
	return Math.min(a, b);
}

function lastBracket(t: string): number {
	return Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
}

/** Reduce any accepted shape to a list of raw progression records. */
function normalise(data: unknown): Record<string, unknown>[] {
	if (Array.isArray(data)) return data.filter(isRecord);
	if (isRecord(data)) {
		if (Array.isArray(data.progressions)) return data.progressions.filter(isRecord);
		if (looksLikeProgression(data)) return [data];
		throw new Error("That JSON doesn't look like a Vamp song (no \"bars\" or \"progressions\").");
	}
	throw new Error("That JSON doesn't look like a Vamp song.");
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A single object is only treated as a song if it carries a tell-tale field —
 *  otherwise arbitrary JSON would silently import as an empty progression. */
function looksLikeProgression(o: Record<string, unknown>): boolean {
	return Array.isArray(o.bars) || typeof o.name === 'string';
}
