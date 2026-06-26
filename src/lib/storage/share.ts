// Share a progression via a URL hash — no backend. The progression is encoded
// as compact base64url JSON in `#s=…` and decoded + migrated on load.

import type { Progression } from '$lib/model/types';
import { migrateProgression } from './db';

function toBase64Url(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
	const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(b64);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

/** Compact, id/timestamp-free encoding of a progression. */
export function encodeProgression(progression: Progression): string {
	const compact = {
		schemaVersion: progression.schemaVersion,
		name: progression.name,
		tempo: progression.tempo,
		timeSignature: progression.timeSignature,
		instrument: progression.instrument,
		groove: progression.groove,
		loopRange: progression.loopRange,
		bars: progression.bars.map((bar) => ({
			slots: bar.slots.map((slot) => ({ chord: slot.chord, beats: slot.beats }))
		}))
	};
	return toBase64Url(JSON.stringify(compact));
}

export function decodeProgression(encoded: string): Progression | null {
	try {
		return migrateProgression(JSON.parse(fromBase64Url(encoded)));
	} catch {
		return null;
	}
}

const HASH_KEY = 's';

export function buildShareUrl(progression: Progression): string {
	const base = `${location.origin}${location.pathname}`;
	return `${base}#${HASH_KEY}=${encodeProgression(progression)}`;
}

/** Read a shared progression from the current URL hash, if present. */
export function readSharedProgression(): Progression | null {
	if (typeof location === 'undefined' || !location.hash) return null;
	const params = new URLSearchParams(location.hash.replace(/^#/, ''));
	const encoded = params.get(HASH_KEY);
	return encoded ? decodeProgression(encoded) : null;
}
