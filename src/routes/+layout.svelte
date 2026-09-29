<script lang="ts">
	import '../app.scss';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { MediaQuery } from 'svelte/reactivity';
	import { progression } from '$lib/stores/progression.svelte';
	import { view, TRANSPOSE_OPTIONS, THEME_OPTIONS } from '$lib/stores/view.svelte';
	import { library } from '$lib/stores/library.svelte';
	import { notice } from '$lib/stores/notice.svelte';
	import { droneState } from '$lib/stores/drone.svelte';
	import { engine } from '$lib/audio/engine';
	import { isValidChordSymbol } from '$lib/audio/chord';
	import { classifyChord, type ChordFamily } from '$lib/model/chords';
	import { beatsToQuarters } from '$lib/model/time';
	import { createMeadow, type Meadow, type MeadowSignal } from '$lib/art/meadow';
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
	//
	// The shared song is always SHOWN, but only becomes your session (the draft
	// restored next launch) if the canvas was blank. Otherwise opening a link would
	// overwrite unsaved work — in this tab, and in every other tab the next time
	// it reloads. Blank covers the common transfer case (your own link, opened on a
	// device with nothing on it yet); editing the shared song adopts it anyway.
	onMount(() => {
		const shared = readSharedProgression();
		if (!shared) return;
		progression.load(shared, { adopt: progression.isBlank });
		// Consume the link. Left in the address bar, every reload (and every
		// browser tab restore) re-applies the ORIGINAL shared song over whatever
		// you've done to it since — and your next edit would then save that
		// pristine copy as the draft, losing everything in between.
		//
		// Deferred one macrotask: SvelteKit's router isn't started during onMount
		// (it marks itself started only after the initial afterNavigate callbacks,
		// and in dev its replaceState throws until then). Start-up yields only a
		// microtask between mounting and starting, so a setTimeout lands after it.
		const clean = location.pathname + location.search;
		setTimeout(() => {
			try {
				replaceState(clean, page.state);
			} catch {
				// Router still not ready (a future SvelteKit start-up change?): fall
				// back to the native call, keeping history.state so SvelteKit's own
				// per-entry bookkeeping survives. Only the hash changes.
				history.replaceState(history.state, '', clean);
			}
		}, 0);
	});

	// Keep a sounding "follow the key" drone in tune when the inferred key
	// changes (edits, or the key-cycle drill transposing every loop). Lives here
	// — always mounted — because the Practice panel can be collapsed, and the
	// Practice route unmounts the editor entirely, while the drone keeps sounding.
	$effect(() => {
		droneState.syncKey(keyInfo.tonic);
	});

	// Quick-save the current track to the library (overwrite by id, or create).
	// library.save never throws — a storage failure lands in library.error.
	async function quickSave() {
		const existed = library.items.some((i) => i.id === progression.current.id);
		const name = progression.current.name?.trim() || 'Untitled';
		library.error = null;
		await library.save($state.snapshot(progression.current));
		notice.show(library.error ?? `${existed ? 'Updated' : 'Saved'} “${name}”`);
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

	// The browser chrome (address bar, installed-app title bar) takes the page's
	// ground, whichever theme is showing — pinned or following the system.
	$effect(() => {
		void view.night;
		void view.themePref;
		const ground = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim();
		if (!ground) return;
		for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', ground);
	});

	// Keep the screen awake while music plays — your hands are on an instrument,
	// not the phone. The lock drops when the tab hides, so take it again on return.
	$effect(() => {
		if (!progression.isPlaying || !('wakeLock' in navigator)) return;
		let lock: WakeLockSentinel | null = null;
		let done = false;
		const acquire = async () => {
			if (done || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
			try {
				lock = await navigator.wakeLock.request('screen');
				if (done) void lock.release();
			} catch {
				// Refused (battery saver, permissions policy): the screen may sleep.
			}
		};
		void acquire();
		const onVisibility = () => void acquire();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			done = true;
			document.removeEventListener('visibilitychange', onVisibility);
			void lock?.release();
		};
	});

	// Nature (always on): the art is a picture of the band. Everything below reads the
	// music — the chord sounding, the tempo, the transport's own clock — and when
	// nothing plays, nothing moves.

	// Harmonic weather: the page's light follows the chord family. While the song
	// plays it's the chord sounding; stopped, it's the song's home chord; a rest
	// or a drill clears the sky. One CSS custom property, crossfaded over a beat.
	// The family of every chord in the song, in order — the meadow's garden and
	// the resting weather are both made of these.
	const songFamilies = $derived(
		flattenSlots(progression.current.bars)
			.map((f) => f.slot.chord.trim())
			.filter((c) => c !== '' && isValidChordSymbol(c))
			.map((c) => classifyChord(c))
	);
	// Resting weather: the song's most-used family (a blues gets an orange sky),
	// the home chord's breaking a tie.
	const restingWeather = $derived.by((): ChordFamily | null => {
		if (songFamilies.length === 0) return null;
		const counts = new Map<ChordFamily, number>();
		for (const f of songFamilies) counts.set(f, (counts.get(f) ?? 0) + 1);
		const home: ChordFamily = keyInfo.mode === 'minor' ? 'minor' : 'major';
		let best: ChordFamily = home;
		for (const [f, n] of counts) if (n > (counts.get(best) ?? 0)) best = f;
		return best;
	});

	const weather = $derived.by((): ChordFamily | null => {
		if (!view.artMode) return null;
		if (progression.isPlaying) {
			const i = progression.activeSlot;
			if (engine.source !== 'progression' || i === null) return null;
			const chord = flattenSlots(progression.current.bars)[i]?.slot.chord ?? '';
			return chord.trim() && isValidChordSymbol(chord) ? classifyChord(chord) : null;
		}
		return restingWeather;
	});

	$effect(() => {
		const root = document.documentElement;
		if (weather) root.style.setProperty('--weather', `var(--c-${weather})`);
		else root.style.removeProperty('--weather');
		root.style.setProperty('--weather-ms', `${Math.round(60000 / progression.current.tempo)}ms`);
	});

	// Wind in the grass. Gusts start where the chord changed on screen.
	let meadowEl = $state<HTMLCanvasElement | null>(null);
	let meadow: Meadow | null = null;
	let changeAt = 0;
	let originX = 0.5;
	let lastSlot: number | null = null;

	const signal = (): MeadowSignal => ({
		clock: engine.clock(),
		quartersPerBeat:
			engine.source === 'progression' ? beatsToQuarters(1, progression.current.timeSignature) : 1,
		family: progression.isPlaying ? weather : null,
		changeAt,
		originX,
		songFamilies
	});

	$effect(() => {
		if (!view.artMode || !meadowEl) return;
		const m = createMeadow(meadowEl, signal);
		meadow = m;
		if (reducedMotion.current) {
			// A still frame in the current chord's colour; redrawn on changes below.
			m.drawStatic();
			const onStaticResize = () => m.drawStatic();
			window.addEventListener('resize', onStaticResize, { passive: true });
			return () => {
				window.removeEventListener('resize', onStaticResize);
				m.stop();
				meadow = null;
			};
		}
		m.resize();
		const onResize = () => m.resize();
		const onVisibility = () => {
			if (!document.hidden) m.wake();
		};
		window.addEventListener('resize', onResize, { passive: true });
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			m.stop();
			meadow = null;
			window.removeEventListener('resize', onResize);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	// The theme changed: re-ink the meadow from the new tokens.
	$effect(() => {
		void view.night;
		meadow?.refresh();
	});

	// The song changed shape while stopped: regrow the garden in its colours.
	$effect(() => {
		void songFamilies;
		if (!meadow || progression.isPlaying) return;
		if (reducedMotion.current) meadow.drawStatic();
		else meadow.resize();
	});

	// The music changed (play, stop, a new chord): note where, and wake the field.
	$effect(() => {
		const slot = progression.activeSlot;
		void progression.engineState;
		void weather;
		if (slot !== lastSlot) {
			lastSlot = slot;
			if (slot !== null) {
				changeAt = performance.now();
				const el = document.querySelector('.slot--active');
				if (el) {
					const r = el.getBoundingClientRect();
					originX = (r.left + r.width / 2) / Math.max(1, window.innerWidth);
				}
			}
		}
		if (!meadow) return;
		if (reducedMotion.current) meadow.drawStatic();
		else meadow.wake();
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="frame" class:art={view.artMode}>
	{#if view.artMode}
		<div class="art-weather" aria-hidden="true"></div>
		<!-- The sun rises when the band starts and settles when it stops. -->
		<div class="art-sun" class:art-sun--up={progression.isPlaying} aria-hidden="true"></div>
		<canvas class="art-meadow" bind:this={meadowEl} aria-hidden="true"></canvas>
	{/if}
	<header class="head">
		<div class="head__left">
			<span class="wordmark head__mark">Vamp</span>
			<nav class="nav" aria-label="Workspace">
				<a class="nav__link" class:nav__link--on={!onPractice} aria-current={!onPractice ? 'page' : undefined} href={SKETCH}>Sketch</a>
				<a class="nav__link" class:nav__link--on={onPractice} aria-current={onPractice ? 'page' : undefined} href={PRACTICE}>Practice</a>
			</nav>
		</div>
		<div class="head__right">
			<fieldset class="theme">
				<legend class="theme__legend">Theme</legend>
				{#each THEME_OPTIONS as t (t.id)}
					<label class="theme__opt" title={t.label}>
						<input
							class="theme__input"
							type="radio"
							name="vamp-theme"
							value={t.id}
							checked={view.themePref === t.id}
							onchange={() => view.setTheme(t.id)}
						/>
						<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
							{#if t.id === 'day'}
								<!-- Sunrise: the sun coming up over the horizon. -->
								<path d="M3.5 11a4.5 4.5 0 0 1 9 0Z" fill="currentColor" />
								<path
									d="M1.5 13h13M8 2.5v2.2M2.9 5.6l1.4 1.2M13.1 5.6l-1.4 1.2"
									stroke="currentColor"
									stroke-width="1.4"
									stroke-linecap="round"
								/>
							{:else if t.id === 'night'}
								<!-- Sunset: the sun half-gone, a first star. -->
								<path d="M4 12.5a4 4 0 0 1 8 0Z" fill="currentColor" />
								<path d="M1.5 13h13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
								<circle cx="12.5" cy="3.5" r="1.1" fill="currentColor" />
							{:else}
								<circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4" />
								<path d="M8 2.8a5.2 5.2 0 0 1 0 10.4Z" fill="currentColor" />
							{/if}
						</svg>
						<span class="theme__text">{t.label}</span>
					</label>
				{/each}
			</fieldset>
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

<!-- Always mounted, so the live region exists before a notice is written into
     it (a region inserted together with its text is often not announced). -->
<div class="notice-host" role="status" aria-live="polite">
	{#if notice.current}
		{#key notice.current.id}
			<!-- The pointer handlers only pause the dismiss timer while you reach for
			     the action; they're not a control, so the div needs no role. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="notice"
				class:notice--action={!!notice.current.action}
				onpointerenter={() => notice.hold()}
				onpointerleave={() => notice.release()}
				onfocusin={() => notice.hold()}
				onfocusout={() => notice.release()}
			>
				<span class="notice__text">{notice.current.text}</span>
				{#if notice.current.action}
					<button class="notice__action" type="button" onclick={() => notice.act()}
						>{notice.current.action.label}</button
					>
				{/if}
			</div>
		{/key}
	{/if}
</div>

{#if updateReady}
	<div class="update" role="status">
		<span class="label">New version available</span>
		<button class="update__btn" type="button" onclick={() => reloadSW?.(true)}>Reload</button>
	</div>
{/if}

<style lang="scss">
	.frame {
		min-height: 100vh;
	}

	/* The one transient notice (quick-save, "Replaced … · Undo"). The host spans
	   the bottom edge but lets clicks through; only the notice itself is hit. */
	.notice-host {
		position: fixed;
		left: 0;
		right: 0;
		bottom: var(--space-6);
		z-index: 100;
		display: flex;
		justify-content: center;
		padding: 0 var(--space-4);
		pointer-events: none;
	}

	.notice {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		max-width: 100%;
		padding: var(--space-2) var(--space-4);
		background: var(--color-black);
		color: var(--color-white);
		font-size: 0.85rem;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
		animation: notice-in 140ms var(--motion-ease-out);
	}

	.notice--action {
		pointer-events: auto;
		padding-right: var(--space-2);
	}

	.notice__text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.notice__action {
		flex: 0 0 auto;
		min-height: 36px;
		border: 1px solid var(--color-white);
		background: transparent;
		color: var(--color-white);
		padding: 0 var(--space-3);
		font-family: inherit;
		font-size: 0.8rem;

		&:hover {
			background: var(--color-white);
			color: var(--color-black);
		}

		&:focus-visible {
			outline: 2px solid var(--color-white);
			outline-offset: 2px;
		}
	}

	@keyframes notice-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.notice {
			animation: none;
		}
	}

	/* The notebook's running head: hand-lettered name, the two workspaces, and the
	   per-device settings. Sits on the page ground, closed by one hairline rule. */
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		/* The two groups drop onto separate rows rather than running off the edge. */
		flex-wrap: wrap;
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--rule);
	}

	.head__left {
		display: flex;
		align-items: center;
		gap: var(--space-6);
		/* Without this, a flex child refuses to shrink below its content width and
		   pushes the pitch select off-screen instead of wrapping. */
		min-width: 0;
	}

	/* The name, catching the light. */
	.head__mark {
		font-size: 1.875rem;
		line-height: 1;
		color: var(--ink);
		text-shadow: var(--text-glow);
		/* Petaluma sits high in its em box; nudge it onto the nav's baseline. */
		transform: translateY(2px);
	}

	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.nav__link {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--space-2);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--ink-2); /* stays ≥4.5:1 under the strongest weather */
		text-decoration: none;
		transition: color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			color: var(--ink);
		}
	}

	/* The current workspace: ink, underlined in the spot pink. */
	.nav__link--on {
		color: var(--ink);
		text-decoration: underline;
		text-decoration-color: var(--spot);
		text-decoration-thickness: 3px;
		text-underline-offset: 6px;
	}

	.head__right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	/* Day · Auto · Night: three radio segments, the chosen one inked in spot pink. */
	.theme {
		display: inline-flex;
		margin: 0;
		padding: 2px;
		border: 1px solid var(--edge);
		border-radius: var(--radius-pill);
		background: var(--paper);
	}

	.theme__legend,
	.theme__text {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.theme__opt {
		position: relative;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-pill);
		color: var(--ink-2);
		cursor: pointer;
		transition:
			background-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			color: var(--ink);
			background: var(--wash);
		}

		&:has(.theme__input:checked) {
			background: var(--spot);
			color: var(--on-spot);
		}

		&:has(.theme__input:focus-visible) {
			outline: 2px solid var(--ink);
			outline-offset: 2px;
		}

		@media (pointer: coarse) {
			width: 40px;
			height: 40px;
		}
	}

	.theme__input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.head__pitch {
		min-height: 36px;
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--ink);
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--edge);
		padding: 0 var(--space-1);
		border-radius: 0;
		min-width: 0;

		&:hover,
		&:focus {
			border-bottom-color: var(--ink);
		}

		option {
			background: var(--paper);
			color: var(--ink);
		}
	}

	@media (pointer: coarse) {
		.head__pitch {
			min-height: var(--tap);
		}
	}

	/* Phone: wordmark + nav on one row, the controls on their own underneath.
	   Everything fitted on one line at 375px only by overflowing the viewport. */
	@media (max-width: 600px) {
		.head {
			padding: var(--space-2) var(--space-4);
			gap: var(--space-1);
		}

		.head__left,
		.head__right {
			flex: 1 1 100%;
		}

		.head__left {
			gap: var(--space-4);
		}

		.head__right {
			justify-content: flex-start;
		}

		.head__mark {
			font-size: 1.5rem;
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
			background: var(--color-white);
			color: var(--color-black);
		}
	}
</style>
