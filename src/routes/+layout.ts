// Prerender the app shell to a static index.html (needed for GitHub Pages),
// and disable SSR so browser-only APIs (AudioContext, IndexedDB) are safe.
// This is a fully client-side, local-first app.
export const prerender = true;
export const ssr = false;
