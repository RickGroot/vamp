<script lang="ts">
	// A Roman numeral as printed: 'bVII7' → ♭VII7, with the accidental drawn
	// (Accidental.svelte). Case is meaning — ii is minor, II major — so this
	// never inherits a parent's text-transform: an uppercase button would turn a
	// right answer into a wrong-looking one.
	// The drawn face is hidden from assistive tech and the numeral is SAID, with
	// the quality its case carries ('ii' → "two minor"), since case is never spoken.
	import Accidental from './Accidental.svelte';
	import { spokenNumeral } from '$lib/model/numerals';

	let { numeral }: { numeral: string } = $props();

	const parts = $derived.by(() => {
		const m = /^([b#]?)(.*)$/.exec(numeral) ?? ['', '', numeral];
		return { accidental: m[1], rest: m[2] };
	});
</script>

<span class="num" aria-hidden="true"
	>{#if parts.accidental === 'b'}<Accidental kind="flat" />{:else if parts.accidental === '#'}<Accidental
			kind="sharp"
		/>{/if}{parts.rest}</span
><span class="visually-hidden">{spokenNumeral(numeral)}</span>

<style>
	.num {
		display: inline-flex;
		align-items: baseline;
		white-space: nowrap;
		text-transform: none;
		letter-spacing: 0.02em;
	}
</style>
