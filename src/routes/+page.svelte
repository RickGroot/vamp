<script lang="ts">
	import { base } from '$app/paths';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { resolveLoopRange } from '$lib/model/time';
	import { flattenSlots } from '$lib/model/slots';
	import { inferKey } from '$lib/model/key';
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
	import PatternInsights from '$lib/components/PatternInsights.svelte';
	import StandView from '$lib/components/StandView.svelte';
	import PlayDock from '$lib/components/PlayDock.svelte';
	import EmptyStart from '$lib/components/EmptyStart.svelte';
	import { detectProgressions } from '$lib/model/analysis';

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
	// Recognised named progressions — pure derived state, recomputed per edit
	// (a few thousand ops for a 32-bar song; no debounce needed).
	const detections = $derived(detectProgressions(progression.current.bars, keyInfo));
	// Bar range covered by a hovered/focused insight chip (transient UI state —
	// deliberately NOT in a store or undo history).
	let hint = $state<{ start: number; end: number } | null>(null);

	// The music stand, and the dock that appears once the transport scrolls away.
	let standOpen = $state(false);
	let transportEl = $state<HTMLElement>();
	let transportInView = $state(true);
	$effect(() => {
		if (!transportEl || typeof IntersectionObserver === 'undefined') return;
		const io = new IntersectionObserver(([entry]) => (transportInView = entry.isIntersecting));
		io.observe(transportEl);
		return () => io.disconnect();
	});

	// Tab title reflects the progression name once it's been named.
	const pageTitle = $derived.by(() => {
		const n = progression.current.name?.trim();
		// Keep in step with the static <title> in src/app.html.
		return n && n !== 'Untitled progression' ? `${n} · Vamp` : 'Vamp — Chord Sketchpad & Practice Companion';
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
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<main class="editor">
	<!-- The song bar: the tune's name, then its actions grouped by what they do —
	     history, the file, the two ways to play along. -->
	<div class="songbar">
		<input
			class="title"
			style:--len={Math.max(8, (progression.current.name || 'Name this tune').length)}
			type="text"
			value={progression.current.name}
			placeholder="Name this tune"
			aria-label="Progression name"
			oninput={(e) => progression.setName((e.target as HTMLInputElement).value)}
		/>
		<div class="songbar__actions">
			<div class="history" role="group" aria-label="History">
				<button
					class="history__btn"
					type="button"
					aria-label="Undo"
					title="Undo (Ctrl+Z)"
					disabled={!progression.canUndo}
					onclick={() => progression.undo()}
				>
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
						><path
							d="M6 3.5 2.5 7 6 10.5M3 7h6.5a4 4 0 0 1 0 8H8"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
				</button>
				<button
					class="history__btn"
					type="button"
					aria-label="Redo"
					title="Redo (Ctrl+Y)"
					disabled={!progression.canRedo}
					onclick={() => progression.redo()}
				>
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
						><path
							d="M10 3.5 13.5 7 10 10.5M13 7H6.5a4 4 0 0 0 0 8H8"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
				</button>
			</div>
			<div class="songbar__docs">
				<FileMenu />
				<ShareMenu />
			</div>
			<div class="songbar__modes">
				<button class="bar-btn" type="button" onclick={() => (standOpen = true)}>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
						><path
							d="M3 2.5h10v6H3zM8 8.5v5M5 13.5h6"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
					Stand
				</button>
				<!-- Takes the current changes straight into a guide-tone drill. A link,
				     not a button: it is navigation, and it should middle-click. -->
				<a class="bar-btn bar-btn--primary" href="{base}/practice?drill=guide-tones">Practise this</a>
			</div>
		</div>
	</div>

	<div bind:this={transportEl}>
		<TransportBar />
	</div>

	<!-- Ways to put chords on the chart. -->
	<div class="tools">
		<span class="label tools__label">Add chords</span>
		<div class="tools__grid">
			<PresetMenu />
			<ExampleMenu />
			<SuggestMenu {keyInfo} />
			<button class="bar-btn" type="button" onclick={() => progression.inspire()}
				>Inspire<span class="tools__long"> me</span></button
			>
		</div>
	</div>

	{#if progression.isBlank}
		<EmptyStart />
	{/if}

	<!-- The chart's own header: what the progression is, and how to read it. -->
	<div class="chart-head">
		<PatternInsights {detections} {keyInfo} onhint={(r) => (hint = r)} />
		<button
			class="bar-btn chart-head__roman"
			class:bar-btn--on={view.showRoman}
			type="button"
			aria-pressed={view.showRoman}
			title="Show each chord's function in the key"
			onclick={() => view.setShowRoman(!view.showRoman)}
		>
			<span class="chart-head__numeral" aria-hidden="true">IV</span>
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
				hinted={hint !== null && barIndex >= hint.start && barIndex <= hint.end}
				{loopActive}
				inLoop={barIndex >= loopRange.start && barIndex <= loopRange.end}
				loopStart={loopActive && barIndex === loopRange.start}
				loopEnd={loopActive && barIndex === loopRange.end}
				final={barIndex === progression.current.bars.length - 1}
				invite={barIndex === 0 && progression.isBlank}
				{keyInfo}
				playing={barIndex === playingBar}
			/>
		{/each}

		<button class="add-bar" type="button" onclick={() => progression.addBar()}>
			<span aria-hidden="true">+</span> Add bar
		</button>
	</section>

	<NotationView />

	<ScalesSection />

	<BandPanel />

	<PracticePanel defaultRoot={keyInfo.tonic} />
</main>

<PlayDock shown={!transportInView && !standOpen} onstand={() => (standOpen = true)} />
<StandView bind:open={standOpen} />

<style lang="scss">
	.editor {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6) var(--space-24);
	}

	/* ---- The song bar ---------------------------------------------------- */
	/* The title takes the whole line, like the name across the top of a sleeve;
	   the actions run beneath it as one toolbar — the file on the left, the two
	   ways to play along on the right. */
	.songbar {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
	}

	.songbar__actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
	}

	.songbar__modes {
		margin-left: auto;
	}

	.songbar__docs,
	.songbar__modes {
		display: flex;
		gap: var(--space-2);
	}

	/* Undo / redo: two printed boxes sharing a rule. */
	.history {
		display: inline-flex;
		border: var(--rule-heavy) solid var(--ink);
	}

	.history__btn {
		display: grid;
		place-items: center;
		width: 38px;
		height: 34px;
		border: 0;
		background: transparent;
		color: var(--ink);

		& + & {
			border-left: var(--rule-heavy) solid var(--ink);
		}

		&:hover:not(:disabled) {
			background: var(--wash);
		}

		&:disabled {
			color: var(--ink-4);
			cursor: not-allowed;
		}

		@media (pointer: coarse) {
			width: var(--tap);
			height: calc(var(--tap) - 2 * var(--rule-heavy));
		}
	}

	/* The tune's name, set like the title on a sleeve: condensed and black. */
	.title {
		min-width: 0;
		width: 100%;
		border: 0;
		border-bottom: var(--rule-heavy) solid transparent;
		background: transparent;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		/* Sized to fit the name on one line: a condensed capital (and the spaces
		   between words) averages about half an em. */
		font-size: max(1.75rem, min(4.75rem, calc(100cqi / (var(--len) * 0.5))));
		line-height: 0.95;
		/* Its own case: a preset names a tune "Jazz ii–V–I in C", and capitals
		   would turn the ii into II — a different chord. */
		color: var(--ink);
		padding: 0 0 var(--space-1);
		text-overflow: ellipsis;
		transition: border-color var(--motion-fast) var(--motion-ease-out);

		&::placeholder {
			color: var(--ink-4);
		}

		&:hover {
			border-bottom-color: var(--rule);
		}

		&:focus {
			outline: none;
			border-bottom-color: var(--ink);
		}
	}

	/* ---- Chord tools ------------------------------------------------------- */
	.tools {
		display: flex;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		flex-wrap: wrap;
		margin-top: var(--space-4);
	}

	.tools__grid {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	/* ---- The chart's header ------------------------------------------------- */
	.chart-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		flex-wrap: wrap;
		margin-top: var(--space-6);
	}

	.chart-head :global(.insights) {
		margin-top: 0;
	}

	.chart-head__roman {
		margin-left: auto;
	}

	.chart-head__numeral {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1rem;
		line-height: 1;
		letter-spacing: 0;
	}

	/* The chart: four measures to a line, like a lead sheet — phrases read as
	   rows. Barlines belong to the measures (BarCard), so there is no column gap. */
	.bars {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		row-gap: var(--space-6);
		margin-top: var(--space-4);
		padding-bottom: var(--space-8);
	}

	@media (max-width: 640px) {
		.bars {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			row-gap: var(--space-4);
		}
	}

	/* The next empty measure, dashed in. */
	.add-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		align-self: stretch;
		min-height: 96px;
		margin-left: var(--space-2);
		border: var(--rule-heavy) dashed var(--ink-4);
		border-radius: 0;
		background: transparent;
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);
		transition:
			border-color var(--motion-fast) var(--motion-ease-out),
			background-color var(--motion-fast) var(--motion-ease-out),
			color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--ink);
			background: var(--wash);
			color: var(--ink);
		}
	}

	/* ---- Layouts by the editor's own width (container queries), so the top of
	   the page arranges itself deliberately rather than wrapping raggedly. ---- */
	.editor {
		container: editor / inline-size;
	}

	/* Phone: a tidy grid, not a strip — history + the file on one row, the two
	   ways to play along as equal halves on the next; the chord tools in one row. */
	@container editor (max-width: 540px) {


		.songbar__actions {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas:
				'history docs'
				'modes modes';
			gap: var(--space-2);
		}

		.history {
			grid-area: history;
		}

		.songbar__docs {
			grid-area: docs;
		}

		.songbar__modes {
			grid-area: modes;
			margin-left: 0;
		}

		.songbar__docs,
		.songbar__modes {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.songbar__docs > :global(*),
		.songbar__modes > :global(*),
		.songbar__docs :global(.bar-btn),
		.tools__grid > :global(*),
		.tools__grid :global(.bar-btn) {
			width: 100%;
		}

		.tools {
			margin-top: var(--space-4);
		}

		/* The four chord tools on one row: short labels, tight padding. */
		.tools__grid {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 6px;
			width: 100%;
		}

		.tools__grid :global(.bar-btn) {
			padding: 0 var(--space-1);
			font-size: 0.6875rem;
			letter-spacing: 0.03em;
		}

		.tools__long {
			display: none;
		}

		/* Popovers from the right half open leftwards, onto the page. */
		.tools__grid > :global(:nth-child(n + 3) .menu),
		.tools__grid > :global(:nth-child(n + 3) .vmenu) {
			left: auto;
			right: 0;
		}

		.chart-head {
			margin-top: var(--space-4);
		}
	}

	@media (max-width: 600px) {
		.editor {
			padding: var(--space-4) var(--space-4) var(--space-12);
		}
	}
</style>
