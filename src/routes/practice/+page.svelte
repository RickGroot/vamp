<script lang="ts">
	// The Practice workspace. Generated drills land here in the next slice; for
	// now this is the route itself — the shared chrome (header, nav, shortcuts,
	// art) comes from +layout.svelte, so this page owns only its own <main>.
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>Practice · Vamp</title>
</svelte:head>

<main class="practice-page">
	<header class="intro">
		<h1 class="wordmark intro__title">Practice</h1>
		<p class="intro__lead">
			Generated drills to play on your horn — scale patterns and chord tones, through every key,
			in your own range, with the band or just a click.
		</p>
	</header>

	<p class="soon label">Drill generator arriving in the next slice.</p>

	<p class="back">
		<a href={base || '/'}>← Back to the sketchpad</a>
	</p>
</main>

<style lang="scss">
	.practice-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-6);
	}

	.intro {
		margin-bottom: var(--space-6);
	}

	.intro__title {
		font-size: 1.75rem;
		margin: 0 0 var(--space-2);
		background: var(--grad-flow);
		background-size: 230% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
	}

	.intro__lead {
		margin: 0;
		max-width: 52ch;
		color: var(--color-text-muted);
	}

	.soon {
		display: inline-block;
		padding: var(--space-3) var(--space-4);
		border: 1px dashed var(--color-border);
		color: var(--color-text-faint);
	}

	.back {
		margin-top: var(--space-6);
	}

	.back a {
		color: var(--color-text-muted);
		text-decoration: none;

		&:hover {
			color: var(--color-black);
		}
	}
</style>
