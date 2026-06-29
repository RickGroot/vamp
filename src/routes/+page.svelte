<script lang="ts">
	import { onMount } from 'svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { view, TRANSPOSE_OPTIONS } from '$lib/stores/view.svelte';
	import { resolveLoopRange } from '$lib/model/time';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey } from '$lib/model/key';
	import { readSharedProgression } from '$lib/storage/share';
	import BarCard from '$lib/components/BarCard.svelte';
	import TransportBar from '$lib/components/TransportBar.svelte';
	import PresetMenu from '$lib/components/PresetMenu.svelte';
	import ExampleMenu from '$lib/components/ExampleMenu.svelte';
	import NotationView from '$lib/components/NotationView.svelte';
	import SuggestMenu from '$lib/components/SuggestMenu.svelte';
	import FileMenu from '$lib/components/FileMenu.svelte';
	import ShareMenu from '$lib/components/ShareMenu.svelte';
	import BandPanel from '$lib/components/BandPanel.svelte';
	import PracticePanel from '$lib/components/PracticePanel.svelte';
	import ScalesSection from '$lib/components/ScalesSection.svelte';

	// Global index of each bar's first slot, for active-slot matching.
	const baseIndices = $derived.by(() => {
		let acc = 0;
		return progression.current.bars.map((bar) => {
			const start = acc;
			acc += bar.slots.length;
			return start;
		});
	});

	const loopActive = $derived(progression.current.loopRange !== null);
	const loopRange = $derived(resolveLoopRange(progression.current));
	const keyInfo = $derived(
		inferKey(flattenSlots(progression.current.bars).map((f) => f.slot.chord))
	);

	// Tab title reflects the progression name once it's been named.
	const pageTitle = $derived.by(() => {
		const n = progression.current.name?.trim();
		return n && n !== 'Untitled progression' ? `${n} · Vamp` : 'Vamp — Chord Sketchpad & Improv Trainer';
	});

	// Which bar the playhead is on (contains the active slot).
	const playingBar = $derived.by(() => {
		const active = progression.activeSlot;
		if (active === null) return -1;
		return progression.current.bars.findIndex((bar, i) => {
			const start = baseIndices[i];
			return active >= start && active < start + bar.slots.length;
		});
	});

	onMount(() => {
		const shared = readSharedProgression();
		if (shared) progression.load(shared);
	});

	// Art mode: cursor-parallax aurora + click ripples. Only attached while art
	// mode is on, and skipped entirely for reduced-motion users.
	$effect(() => {
		if (!view.artMode || typeof window === 'undefined') return;
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

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
			if (Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001) raf = requestAnimationFrame(tick);
		};
		const onMove = (e: PointerEvent) => {
			tx = e.clientX / window.innerWidth;
			ty = e.clientY / window.innerHeight;
			if (!raf) raf = requestAnimationFrame(tick);
		};
		const onDown = (e: PointerEvent) => {
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

	function onKeydown(event: KeyboardEvent) {
		const tag = (event.target as HTMLElement | null)?.tagName;
		const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

		// Spacebar toggles play/stop (unless typing in a field).
		if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !inField) {
			event.preventDefault();
			void progression.toggle();
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
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<div class="frame" class:art={view.artMode}>
	{#if view.artMode}
		<div class="art-bg" aria-hidden="true"></div>
	{/if}
	<header class="head">
		<div class="head__left">
			<span class="wordmark head__mark" class:head__mark--playing={progression.isPlaying}>Vamp</span>
			<span class="label head__tag">Chord sketchpad</span>
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

	<main class="editor">
		<div class="toolbar">
			<input
				class="title"
				type="text"
				value={progression.current.name}
				aria-label="Progression name"
				oninput={(e) => progression.setName((e.target as HTMLInputElement).value)}
			/>
			<div class="toolbar__actions">
				<button
					class="bar-btn"
					type="button"
					disabled={!progression.canUndo}
					onclick={() => progression.undo()}>Undo</button
				>
				<button
					class="bar-btn"
					type="button"
					disabled={!progression.canRedo}
					onclick={() => progression.redo()}>Redo</button
				>
				<FileMenu />
				<ShareMenu />
			</div>
		</div>

		<TransportBar />

		<div class="compose-bar">
			<PresetMenu />
			<ExampleMenu />
			<SuggestMenu />
			<button class="inspire" type="button" onclick={() => progression.inspire()}>Inspire me</button>
			<span class="compose-bar__spacer"></span>
			<button
				class="bar-btn"
				class:bar-btn--on={view.showRoman}
				type="button"
				aria-pressed={view.showRoman}
				onclick={() => view.setShowRoman(!view.showRoman)}
			>
				Roman numerals
			</button>
		</div>

		<section class="bars" aria-label="Bars">
			{#each progression.current.bars as bar, barIndex (bar.id)}
				<BarCard
					{barIndex}
					{bar}
					baseGlobalIndex={baseIndices[barIndex]}
					activeSlot={progression.activeSlot}
					canRemoveBar={progression.current.bars.length > 1}
					{loopActive}
					inLoop={barIndex >= loopRange.start && barIndex <= loopRange.end}
					{keyInfo}
					playing={barIndex === playingBar}
				/>
			{/each}

			<button class="add-bar" type="button" onclick={() => progression.addBar()}> + bar </button>
		</section>

		<NotationView />

		<ScalesSection />

		<BandPanel />

		<PracticePanel defaultRoot={keyInfo.tonic} />
	</main>
</div>

<style lang="scss">
	.frame {
		min-height: 100vh;
		border-top: var(--border-hairline);
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

	.head__tag {
		color: var(--color-text-faint);
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

	.editor {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-12) var(--space-6) var(--space-24);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.toolbar__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
	}

	.title {
		flex: 1 1 280px;
		min-width: 0;
		border: 0;
		background: transparent;
		font-family: inherit;
		font-weight: 300;
		font-size: 2rem;
		letter-spacing: -0.02em;
		color: var(--color-text);
		padding: 0 0 var(--space-2);

		&::placeholder {
			color: var(--color-grey-400);
		}

		&:focus {
			outline: none;
			border-bottom: 1px solid var(--color-accent);
		}
	}

	.compose-bar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin-top: var(--space-4);
		flex-wrap: wrap;
	}

	.compose-bar__spacer {
		flex: 1 1 auto;
	}

	.inspire {
		border: 1px solid var(--color-black);
		background: transparent;
		padding: var(--space-2) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);

		&:hover {
			background: var(--grad-play);
			border-color: transparent;
			color: var(--color-white);
		}
	}

	.bars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-6);
	}

	.add-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 96px;
		border: 1px dashed var(--color-grey-400);
		background: transparent;
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		transition:
			border-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}
	}
</style>
