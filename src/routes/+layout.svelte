<script lang="ts">
	import '../app.scss';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import { progression } from '$lib/stores/progression.svelte';
	import { view, TRANSPOSE_OPTIONS } from '$lib/stores/view.svelte';
	import { library } from '$lib/stores/library.svelte';
	import { droneState } from '$lib/stores/drone.svelte';
	import { cursor } from '$lib/stores/cursor.svelte';
	import { createLattice } from '$lib/art/lattice';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey } from '$lib/model/key';
	import { readSharedProgression } from '$lib/storage/share';

	let { children } = $props();

	// The workspace chrome (frame, header, art, shortcuts) is shared by every
	// route, so Sketch and Practice look and behave like one app.
	const SKETCH = `${base}/`;
	const PRACTICE = `${base}/practice`;
	const onPractice = $derived(page.url.pathname.replace(/\/$/, '') === PRACTICE.replace(/\/$/, ''));

	const keyInfo = $derived(
		inferKey(flattenSlots(progression.current.bars).map((f) => f.slot.chord))
	);

	let updateReady = $state(false);
	let reloadSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

	onMount(async () => {
		if (!browser) return;
		try {
			const { registerSW } = await import('virtual:pwa-register');
			reloadSW = registerSW({
				immediate: true,
				onNeedRefresh: () => (updateReady = true)
			});
		} catch {
			// Service worker not available (e.g. dev) — app still works online.
		}
	});

	// A shared link may land on any route (the hash survives navigation), so the
	// read lives here rather than on the editor page.
	onMount(() => {
		const shared = readSharedProgression();
		if (shared) progression.load(shared);
	});

	// Keep a sounding "follow the key" drone in tune when the inferred key
	// changes (edits, or the key-cycle drill transposing every loop). Lives here
	// — always mounted — because the Practice panel can be collapsed, and the
	// Practice route unmounts the editor entirely, while the drone keeps sounding.
	$effect(() => {
		droneState.syncKey(keyInfo.tonic);
	});

	// Quick-save the current track to the library (overwrite by id, or create).
	let saveToast = $state<string | null>(null);
	let saveToastTimer: ReturnType<typeof setTimeout> | undefined;
	async function quickSave() {
		const existed = library.items.some((i) => i.id === progression.current.id);
		const name = progression.current.name?.trim() || 'Untitled';
		try {
			await library.save($state.snapshot(progression.current));
			saveToast = `${existed ? 'Updated' : 'Saved'} “${name}”`;
		} catch {
			saveToast = 'Save failed — storage unavailable';
		}
		clearTimeout(saveToastTimer);
		saveToastTimer = setTimeout(() => (saveToast = null), 1800);
	}

	// Shortcuts live here (and ONLY here) so they work identically on every route.
	function onKeydown(event: KeyboardEvent) {
		const tag = (event.target as HTMLElement | null)?.tagName;
		const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

		// Spacebar toggles play/stop — but never steal Space from a focused
		// interactive element (buttons activate with Space; hijacking it makes
		// every button in the app toggle playback for keyboard users).
		if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !inField) {
			const el = event.target;
			if (el instanceof Element && el.closest('button, a, select, input, textarea, [contenteditable]'))
				return;
			event.preventDefault();
			void progression.toggle();
			return;
		}

		// Ctrl/Cmd+S — quick-save (overwrite the current track, or create). Works
		// everywhere, including while a field is focused, and never opens the browser
		// save dialog.
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void quickSave();
			return;
		}

		if (!(event.ctrlKey || event.metaKey)) return;
		// Let form fields keep their own native undo.
		if (inField) return;
		const key = event.key.toLowerCase();
		if (key === 'z' && !event.shiftKey) {
			event.preventDefault();
			progression.undo();
		} else if (key === 'y' || (key === 'z' && event.shiftKey)) {
			event.preventDefault();
			progression.redo();
		}
	}

	// Reactive so both art effects re-run when the OS setting flips mid-session
	// (a one-shot matchMedia read left the wrong mode running until re-toggle).
	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	// Art mode: cursor-parallax aurora + click ripples. Only attached while art
	// mode is on, and skipped entirely for reduced-motion users.
	$effect(() => {
		if (!view.artMode || typeof window === 'undefined') return;
		if (reducedMotion.current) return;

		const root = document.documentElement;
		let raf = 0;
		let mx = 0.5,
			my = 0.5,
			tx = 0.5,
			ty = 0.5;
		const tick = () => {
			raf = 0;
			mx += (tx - mx) * 0.12;
			my += (ty - my) * 0.12;
			root.style.setProperty('--art-px', `${((mx - 0.5) * 30).toFixed(1)}px`);
			root.style.setProperty('--art-py', `${((my - 0.5) * 30).toFixed(1)}px`);
			// Feed the smoothed cursor to the generative lattice.
			cursor.mx = mx;
			cursor.my = my;
			if (Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001) raf = requestAnimationFrame(tick);
		};
		const onMove = (e: PointerEvent) => {
			tx = e.clientX / window.innerWidth;
			ty = e.clientY / window.innerHeight;
			// Freshness backstop: tick() self-cancels once the lerp settles, so write
			// the raw target here too — the lattice always reads a current value.
			cursor.mx = tx;
			cursor.my = ty;
			if (!raf) raf = requestAnimationFrame(tick);
		};
		const onDown = (e: PointerEvent) => {
			cursor.pingX = e.clientX;
			cursor.pingY = e.clientY;
			cursor.pingT = performance.now();
			const ripple = document.createElement('div');
			ripple.className = 'art-ripple';
			ripple.style.left = `${e.clientX}px`;
			ripple.style.top = `${e.clientY}px`;
			document.body.appendChild(ripple);
			ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
		};
		window.addEventListener('pointermove', onMove, { passive: true });
		window.addEventListener('pointerdown', onDown, { passive: true });
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerdown', onDown);
			cancelAnimationFrame(raf);
			root.style.removeProperty('--art-px');
			root.style.removeProperty('--art-py');
		};
	});

	// Generative geometric lattice (canvas). Owns its own rAF, so it keeps
	// breathing after the aurora's settling loop stops. Reads the shared cursor
	// channel each frame; renders a single static frame for reduced-motion users.
	let latticeEl = $state<HTMLCanvasElement | null>(null);
	$effect(() => {
		if (!view.artMode || typeof window === 'undefined' || !latticeEl) return;
		const lattice = createLattice(latticeEl, () => cursor);
		if (reducedMotion.current) {
			// Static frame, no rAF — but it must still track the viewport, or a
			// resize stretches the stale bitmap into blurry non-square cells.
			lattice.drawStatic();
			const onStaticResize = () => lattice.drawStatic();
			window.addEventListener('resize', onStaticResize, { passive: true });
			return () => window.removeEventListener('resize', onStaticResize);
		}
		lattice.start();
		const onResize = () => lattice.resize();
		const onVisibility = () => (document.hidden ? lattice.stop() : lattice.start());
		window.addEventListener('resize', onResize, { passive: true });
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			lattice.stop();
			window.removeEventListener('resize', onResize);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="frame" class:art={view.artMode}>
	{#if view.artMode}
		<div class="art-bg" aria-hidden="true"></div>
		<canvas class="art-lattice" bind:this={latticeEl} aria-hidden="true"></canvas>
	{/if}
	<header class="head">
		<div class="head__left">
			<span class="wordmark head__mark" class:head__mark--playing={progression.isPlaying}>Vamp</span>
			<nav class="nav" aria-label="Workspace">
				<a class="nav__link" class:nav__link--on={!onPractice} aria-current={!onPractice ? 'page' : undefined} href={SKETCH}>Sketch</a>
				<a class="nav__link" class:nav__link--on={onPractice} aria-current={onPractice ? 'page' : undefined} href={PRACTICE}>Practice</a>
			</nav>
		</div>
		<div class="head__right">
			<button
				class="art-toggle"
				class:art-toggle--on={view.artMode}
				type="button"
				aria-pressed={view.artMode}
				title="Generative art mode"
				onclick={() => view.setArtMode(!view.artMode)}
			>
				<span class="art-toggle__dot" aria-hidden="true"></span>
				Art
			</button>
			<label class="label" for="pitch">Pitch</label>
			<select
				id="pitch"
				class="head__pitch"
				value={view.transposeId}
				onchange={(e) => view.setTranspose((e.target as HTMLSelectElement).value)}
			>
				{#each TRANSPOSE_OPTIONS as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</div>
	</header>

	{@render children()}
</div>

{#if saveToast}
	<div class="save-toast" role="status" aria-live="polite">{saveToast}</div>
{/if}

{#if updateReady}
	<div class="update" role="status">
		<span class="label">New version available</span>
		<button class="update__btn" type="button" onclick={() => reloadSW?.(true)}>Reload</button>
	</div>
{/if}

<style lang="scss">
	.frame {
		min-height: 100vh;
		border-top: var(--border-hairline);
	}

	/* Transient confirmation for Ctrl/Cmd+S quick-save. */
	.save-toast {
		position: fixed;
		left: 50%;
		bottom: var(--space-6);
		transform: translateX(-50%);
		z-index: 100;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-pill, 999px);
		background: var(--color-black);
		color: var(--color-white);
		font-size: 0.85rem;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
		pointer-events: none;
		animation: save-toast-in 140ms var(--motion-ease-out);
	}
	@keyframes save-toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.save-toast {
			animation: none;
		}
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	.head__left {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
	}

	.head__mark {
		font-size: 1.25rem;
		background: var(--grad-flow);
		background-size: 230% 100%;
		background-position: 0% 0;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		transition: background-position var(--motion-grad) var(--motion-ease-out);
	}

	/* While playing, the wordmark sweeps to the same cool colours as the play button. */
	.head__mark--playing {
		background-position: 100% 0;
	}

	.nav {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.nav__link {
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-faint);
		text-decoration: none;
		padding-bottom: 2px;
		border-bottom: 1px solid transparent;
		transition: color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			color: var(--color-black);
		}

		&:focus-visible {
			outline: 2px solid var(--color-accent);
			outline-offset: 2px;
		}
	}

	/* The current workspace — underlined, not just coloured. */
	.nav__link--on {
		color: var(--color-black);
		border-bottom-color: var(--color-black);
	}

	.head__right {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.art-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		align-self: center;
		border: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-1) var(--space-2);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		transition:
			color var(--motion-fast) var(--motion-ease-out),
			border-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}

		&--on {
			border-color: transparent;
			color: var(--color-white);
			background: var(--grad-flow);
			background-size: 200% 100%;
			background-position: 55% 0;
		}
	}

	.art-toggle__dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
		background: var(--grad-flow);
		background-size: 200%;
	}

	.art-toggle--on .art-toggle__dot {
		background: var(--color-white);
	}

	.head__pitch {
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--color-text);
		background: var(--color-white);
		border: 0;
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-1) 0;
		border-radius: 0;

		&:focus {
			outline: none;
			border-bottom-color: var(--color-accent);
		}
	}

	.update {
		position: fixed;
		left: 50%;
		bottom: var(--space-6);
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: var(--color-black);
		color: var(--color-white);
		z-index: 10;
	}

	.update :global(.label) {
		color: var(--color-white);
	}

	.update__btn {
		border: 1px solid var(--color-white);
		background: transparent;
		color: var(--color-white);
		padding: var(--space-1) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;

		&:hover {
			background: var(--color-orange);
			border-color: var(--color-orange);
		}
	}
</style>
