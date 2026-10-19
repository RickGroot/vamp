<script lang="ts">
	// The Learn workspace: hear what chords do, then name it. The shared chrome
	// (header, nav, shortcuts, field) comes from +layout.svelte, so this page owns
	// only its own <main>.
	//
	// Modes are places, so they are links (`?mode=…`) with aria-current, underlined
	// like the workspace nav. A mode joins the tab row once it is built; until then
	// its component is a stub nobody sees, so phases can land independently.
	import { onDestroy, untrack } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { learn } from '$lib/stores/learn.svelte';
	import LearnMap from '$lib/components/learn/LearnMap.svelte';
	import EarMode from '$lib/components/learn/EarMode.svelte';
	import ExplainMode from '$lib/components/learn/ExplainMode.svelte';
	import ReviewMode from '$lib/components/learn/ReviewMode.svelte';
	import LabMode from '$lib/components/learn/LabMode.svelte';

	type Mode = 'map' | 'ear' | 'song' | 'review' | 'lab';

	const MODES: { id: Mode; label: string; ready: boolean }[] = [
		{ id: 'map', label: 'Map', ready: true },
		{ id: 'ear', label: 'Ear', ready: true },
		{ id: 'song', label: 'Your song', ready: true },
		{ id: 'review', label: 'Review', ready: false },
		{ id: 'lab', label: 'Lab', ready: true }
	];
	const shown = MODES.filter((m) => m.ready);

	const mode = $derived.by((): Mode => {
		const wanted = page.url.searchParams.get('mode');
		return shown.find((m) => m.id === wanted)?.id ?? 'map';
	});

	// Changing mode ends whatever the last one was playing.
	let lastMode: Mode | null = null;
	$effect(() => {
		const current = mode;
		if (lastMode !== null && current !== lastMode) untrack(() => learn.stop());
		lastMode = current;
	});

	// Space plays whatever the mode on screen registers (stores/workspace) — the
	// card itself, so it always plays what is shown. Not the page: a replay of the
	// last run would sound an old key after the key changed.

	// One transport, one thing playing: leaving Learn stops it (and forgets the
	// last run, so coming back doesn't open on a stale "Play again").
	onDestroy(() => learn.leave());
</script>

<svelte:head>
	<title>Learn · Vamp</title>
</svelte:head>

<main class="learn-page">
	<header class="learn-head">
		<h1 class="display learn-head__title">Learn</h1>
		<p class="hint learn-head__hint">Hear what chords do before you name them.</p>
	</header>

	{#if shown.length > 1}
		<nav class="modes" aria-label="Learn">
			{#each shown as m (m.id)}
				<a
					class="modes__link"
					class:modes__link--on={mode === m.id}
					aria-current={mode === m.id ? 'page' : undefined}
					href="{base}/learn?mode={m.id}">{m.label}</a
				>
			{/each}
		</nav>
	{/if}

	{#if mode === 'ear'}
		<EarMode />
	{:else if mode === 'song'}
		<ExplainMode />
	{:else if mode === 'review'}
		<ReviewMode />
	{:else if mode === 'lab'}
		<LabMode />
	{:else}
		<LearnMap />
	{/if}
</main>

<style lang="scss">
	.learn-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.learn-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-4);
	}

	.learn-head__title {
		margin: 0;
		font-size: 3.5rem;
	}

	.learn-head__hint {
		margin: 0;
	}

	/* Sub-places of Learn: printed words, the one you're on underlined in ink —
	   the same "place, not a switch" rule as the workspace nav. */
	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-6);
		border-bottom: var(--rule-heavy) solid var(--ink);
		/* Pull the content up under the rule; the column gap is for sections. */
		margin-bottom: calc(var(--space-2) - var(--space-6));
	}

	.modes__link {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		font-size: 0.8125rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
		text-decoration: none;
		box-shadow: inset 0 -4px 0 transparent;

		&:hover {
			color: var(--ink);
			box-shadow: inset 0 -4px 0 var(--rule);
		}

		@media (pointer: coarse) {
			min-height: var(--tap);
		}
	}

	.modes__link--on,
	.modes__link--on:hover {
		color: var(--ink);
		box-shadow: inset 0 -4px 0 var(--ink);
	}

	@media (max-width: 640px) {
		.learn-page {
			padding: var(--space-4);
			gap: var(--space-4);
		}

		.learn-head__title {
			font-size: 2.75rem;
		}

		.modes {
			gap: 0 var(--space-4);
		}
	}
</style>
