import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

// GitHub Pages project site lives under /vamp/. Only apply the base path for
// production builds so local `vite dev` stays at the root.
const BASE_PATH = '/vamp';

export default defineConfig(({ command }) => {
	const base = command === 'build' ? BASE_PATH : '';

	return {
		plugins: [
			sveltekit({
				// SvelteKit 2.6x reads config inline from the Vite plugin; `kit`
				// options (adapter/paths/...) are accepted at the top level.
				preprocess: vitePreprocess(),
				compilerOptions: {
					// Force runes mode for app code, leave libraries untouched.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter({
					// SPA fallback so client-side routing works on a static host.
					fallback: '200.html',
					precompress: true
				}),
				paths: { base }
			}),
			SvelteKitPWA({
				registerType: 'prompt',
				// We register manually in +layout.svelte to control the update prompt.
				injectRegister: false,
				scope: `${BASE_PATH}/`,
				// The integration reads the base from `kit.base` to rewrite the precached
				// app-shell entry; with a trailing slash the index precaches as `/vamp/`
				// (matching navigateFallback) instead of the origin root `/`.
				kit: { base: `${BASE_PATH}/` },
				manifest: {
					id: `${BASE_PATH}/`,
					name: 'Vamp — Chord Sketchpad',
					short_name: 'Vamp',
					description:
						'Sketch chord progressions and loop backing tracks to improvise over. Local-first, installable, works offline.',
					start_url: `${BASE_PATH}/`,
					scope: `${BASE_PATH}/`,
					display: 'standalone',
					orientation: 'any',
					background_color: '#ffffff',
					theme_color: '#1c1a1f',
					icons: [
						{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
						{ src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
						// The mark sits inside the central safe zone, so it doubles as maskable.
						{ src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
						// Scalable source for browsers that prefer SVG app icons.
						{ src: 'vamp-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
					],
					// Richer install UI on Android (narrow) and desktop (wide) Chromium.
					screenshots: [
						{
							src: 'screenshot-wide.png',
							sizes: '1280x720',
							type: 'image/png',
							form_factor: 'wide',
							label: 'Vamp — sketch chord progressions and loop backing tracks to improvise over'
						},
						{
							src: 'screenshot-narrow.png',
							sizes: '720x1280',
							type: 'image/png',
							form_factor: 'narrow',
							label: 'Vamp — a local-first chord sketchpad and improv trainer'
						}
					]
				},
				workbox: {
					// Precache the app shell (incl. PNG icons). Samples are runtime-cached below.
					globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
					// The share image + install screenshots are only fetched online by
					// scrapers / the install dialog — no need to bloat the offline precache.
					globIgnores: ['**/og-image.png', '**/screenshot-*.png'],
					// SPA fallback for offline deep links.
					navigateFallback: `${BASE_PATH}/`,
					runtimeCaching: [
						{
							// Cross-origin instrument samples (smpldsnds.github.io + soundfont CDNs).
							// smplr fetches whole files (fetch -> decodeAudioData), so CacheFirst
							// on the full response is sufficient — no range handling needed.
							urlPattern: ({ url }) => url.origin !== self.location.origin,
							handler: 'CacheFirst',
							options: {
								cacheName: 'vamp-samples',
								cacheableResponse: { statuses: [0, 200] },
								expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 365 }
							}
						}
					]
				},
				devOptions: {
					// Keep the SW off during `vite dev` (default), avoiding base-path churn.
					enabled: false
				}
			})
		]
	};
});
