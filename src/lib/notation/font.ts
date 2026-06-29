// Jazz chord-symbol font (Petaluma Script) for the notation view.
//
// Self-hosted for offline use: the woff2 was extracted from VexFlow's embedded
// font data (Petaluma Script, SIL OFL — see petalumascript.NOTICE.md) so we
// never fetch it from a CDN. Registered via the FontFace API rather than CSS so
// we can await it before VexFlow measures + draws the labels.

import petalumaUrl from '$lib/assets/petalumascript.woff2';

/** Font family to set on VexFlow chord annotations. */
export const JAZZ_FONT = 'Petaluma Script';

let loading: Promise<void> | null = null;

/** Register + load the jazz font once. No-op on the server / without FontFace. */
export function ensureJazzFont(): Promise<void> {
	if (loading) return loading;
	if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
		return Promise.resolve();
	}
	const face = new FontFace(JAZZ_FONT, `url(${petalumaUrl})`);
	loading = face
		.load()
		.then((loaded) => {
			document.fonts.add(loaded);
		})
		.catch(() => {
			/* fall back to the default font if it can't load */
		});
	return loading;
}
