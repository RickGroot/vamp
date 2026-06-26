import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Pure unit tests for the music-theory / engine layer. We deliberately do NOT
// load the SvelteKit plugin here — these modules are framework-agnostic, so the
// tests stay fast and free of SSR/build machinery. We do mirror the `$lib` alias
// so modules that import from it resolve.
export default defineConfig({
	resolve: {
		alias: { $lib: resolve(import.meta.dirname, 'src/lib') }
	},
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts']
	}
});
