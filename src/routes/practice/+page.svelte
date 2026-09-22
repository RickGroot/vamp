<script lang="ts">
	// The Practice workspace. The shared chrome (header, nav, shortcuts, art)
	// comes from +layout.svelte, so this page owns only its own <main>.
	import { onDestroy } from 'svelte';
	import { practice } from '$lib/stores/practice.svelte';
	import { view } from '$lib/stores/view.svelte';
	import DrillRunner from '$lib/components/practice/DrillRunner.svelte';
	import DrillPicker from '$lib/components/practice/DrillPicker.svelte';

	// The pitch select lives in the shared header, so mirror it into the drill
	// store rather than reaching across for it at resolve time.
	$effect(() => {
		practice.setOffset(view.offset);
	});

	// One transport, one thing playing: leaving Practice stops the drill rather
	// than leaving it running under the editor.
	onDestroy(() => practice.stop());
</script>

<svelte:head>
	<title>Practice · Vamp</title>
</svelte:head>

<main class="practice-page">
	<DrillRunner />
	<details class="settings" open>
		<summary class="settings__toggle">
			<span class="wordmark settings__title">Set up</span>
			<span class="label settings__hint">Drill · key · range · tempo · backing</span>
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

	.settings {
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-4);
	}

	.settings__toggle {
		display: flex;
		align-items: baseline;
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
		font-size: 1rem;
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
