<script lang="ts">
	// The Practice workspace. The shared chrome (header, nav, shortcuts, art)
	// comes from +layout.svelte, so this page owns only its own <main>.
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { practice } from '$lib/stores/practice.svelte';
	import { progression } from '$lib/stores/progression.svelte';
	import { drillLibrary } from '$lib/stores/drillLibrary.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { workspace } from '$lib/stores/workspace.svelte';
	import { drillById } from '$lib/practice/patterns';
	import DrillRunner from '$lib/components/practice/DrillRunner.svelte';
	import DrillPicker from '$lib/components/practice/DrillPicker.svelte';

	// The pitch select lives in the shared header, so mirror it into the drill
	// store rather than reaching across for it at resolve time.
	$effect(() => {
		practice.setOffset(view.offset);
	});

	// "Practise this" on the Sketch page arrives as ?drill=… — honoured once on
	// mount, so it opens the right drill without overriding a later choice.
	onMount(() => {
		// Saved drills live in IndexedDB — fire-and-forget, failures land in
		// drillLibrary.error rather than breaking the page.
		void drillLibrary.refresh();
		const wanted = page.url.searchParams.get('drill');
		if (wanted && drillById(wanted)) practice.setDrill(wanted);
	});

	// Space plays the drill here, not the song (the layout still stops anything).
	onMount(() => workspace.register(() => void practice.start()));

	// One transport, one thing playing: leaving Practice stops the drill rather
	// than leaving it running under the editor.
	onDestroy(() => practice.stop());
</script>

<svelte:head>
	<title>Practice · Vamp</title>
</svelte:head>

<main class="practice-page">
	<!-- The way back to the song. Sketch's "Practise this" brings you here, and an
	     installed app has no browser Back button, so the return trip is spelled
	     out too. A link: it is navigation. -->
	<a class="bar-btn back" href="{base}/">
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
			><path
				d="M9.5 3.5 5 8l4.5 4.5"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/></svg
		>
		Back to Sketch
		{#if !progression.isBlank}
			<span class="back__song">{practice.songName}</span>
		{/if}
	</a>
	<DrillRunner />
	<details class="settings" open>
		<summary class="settings__toggle">
			<span class="settings__title">Set up</span>
			<span class="hint settings__hint">Drill · key · range · tempo · backing</span>
		</summary>
		<div class="settings__body">
			<DrillPicker />
		</div>
	</details>
</main>

<style lang="scss">
	.practice-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	/* The page's first thing, so it reads as the way back rather than a control. */
	.back {
		align-self: flex-start;
		max-width: 100%;
		/* Pull the drill title up under it; the column gap is for sections. */
		margin-bottom: calc(var(--space-2) - var(--space-6));
		padding-left: var(--space-2);
	}

	/* The tune's name, set like its title, after a quiet separator. */
	.back__song {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1rem;
		color: var(--ink-2);

		&::before {
			content: '·';
			margin-right: var(--space-2);
			font-family: var(--font-ui);
			color: var(--ink-3);
		}
	}

	@media (pointer: coarse) {
		.back {
			min-height: var(--tap);
		}
	}

	.settings {
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-3);
	}

	.settings__toggle {
		display: flex;
		align-items: baseline;
		min-height: var(--tap);
		padding-top: var(--space-1);
		gap: var(--space-3);
		cursor: pointer;
		list-style: none;

		&::-webkit-details-marker {
			display: none;
		}

		&:focus-visible {
			outline: 2px solid var(--color-accent);
			outline-offset: 2px;
		}
	}

	.settings__title {
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.75rem;
		line-height: 1;
		text-transform: uppercase;
	}

	.settings__hint {
		color: var(--color-text-faint);
	}

	.settings__body {
		padding-top: var(--space-4);
	}

	@media (max-width: 640px) {
		.practice-page {
			padding: var(--space-4) var(--space-3);
		}
	}
</style>
