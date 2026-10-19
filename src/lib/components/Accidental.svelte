<script lang="ts">
	// A drawn flat or sharp, sized to the cap height of the text beside it.
	// Archivo has no ♭/♯, and the system fallback came out light, wide and
	// different on every platform — so chord symbols (ChordSymbol) and Roman
	// numerals (Numeral) draw them instead of typing them.
	let { kind }: { kind: 'flat' | 'sharp' } = $props();
</script>

{#if kind === 'flat'}<svg class="acc acc--flat" viewBox="0 0 10.4 24" role="img" aria-label="flat"
		><path
			fill-rule="evenodd"
			d="M0.8 0h2.4v12.6c1.5-1.5 3.1-2.2 4.4-2.2 1.6 0 2.6 1.1 2.6 2.9 0 2.7-2.4 5.6-7 10.7H0.8z M3.2 14.6v6.4c2.6-2.5 3.9-4.5 3.9-6 0-0.8-0.4-1.3-1.1-1.3-0.8 0-1.8 0.3-2.8 0.9z"
		/></svg
	>{:else}<svg class="acc acc--sharp" viewBox="0 0 14 26" role="img" aria-label="sharp"
		><path d="M4 1h2.2v24H4z M8.6 0h2.2v24H8.6z M1 9.4 13 6.2v3.4L1 12.8z M1 17 13 13.8v3.4L1 20.4z" /></svg
	>{/if}

<style>
	.acc {
		display: inline-block;
		fill: currentColor;
		vertical-align: baseline;
	}

	.acc--flat {
		height: 0.76em;
		width: 0.33em;
		margin: 0 0.02em 0 0.04em;
	}

	.acc--sharp {
		height: 0.8em;
		width: 0.43em;
		margin: 0 0.02em 0 0.04em;
		vertical-align: -0.05em;
	}
</style>
