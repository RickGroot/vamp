<script lang="ts" module>
	// The lick and the key you were on, for the rest of the session: coming back
	// to Licks from the map (or another workspace) opens where you left off.
	let pickedLickId = 'lick-blues-thirds';
	let pickedKey = '';
</script>

<script lang="ts">
	// Licks: hear a short line over the band, then play it back in the same
	// length of time that follows. One lick at a time; the card keeps the call and the turn.
	import { LICK_ITEMS, lickFor, type LickItem } from '$lib/learn/lickItems';
	import { KEY_ROOTS } from '$lib/learn/keys';
	import { LICK_STYLES, LICK_STYLE_NAMES } from '$lib/licks/library';
	import LickCard from './LickCard.svelte';

	const groups = LICK_STYLES.map((style) => ({
		style,
		title: LICK_STYLE_NAMES[style],
		items: LICK_ITEMS.filter((i) => lickFor(i)?.style === style)
	})).filter((g) => g.items.length > 0);

	const byLick = (id: string): LickItem | undefined => LICK_ITEMS.find((i) => i.spec.lickId === id);

	let lickId = $state(byLick(pickedLickId) ? pickedLickId : LICK_ITEMS[0].spec.lickId);
	const item = $derived(byLick(lickId) ?? LICK_ITEMS[0]);
	const lick = $derived(lickFor(item));
	const mode = $derived(lick?.mode ?? 'major');

	let picked = $state(pickedKey);
	// A key that isn't one of this lick's mode can't be used: say so, and go back to any key.
	const keyPick = $derived(KEY_ROOTS[mode].includes(picked) ? picked : '');
	const strayKey = $derived(picked && !keyPick ? picked : '');

	function chooseLick(id: string) {
		lickId = id;
		pickedLickId = id;
	}

	function chooseKey(value: string) {
		picked = value;
		pickedKey = value;
	}
</script>

<div class="licks">
	<p class="hint licks__intro">
		Listen to the lick, then play it back in the same length of time that follows. The band keeps going while you play.
	</p>

	<div class="licks__pick">
		<label class="field">
			<span class="label">Lick</span>
			<select class="field__select" value={item.spec.lickId} onchange={(e) => chooseLick((e.target as HTMLSelectElement).value)}>
				{#each groups as group (group.style)}
					<optgroup label={group.title}>
						{#each group.items as option (option.id)}
							<option value={option.spec.lickId}>{lickFor(option)?.name ?? option.title}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</label>
		<label class="field">
			<span class="label">Key</span>
			<select class="field__select" value={keyPick} onchange={(e) => chooseKey((e.target as HTMLSelectElement).value)}>
				<option value="">Any key</option>
				{#each KEY_ROOTS[mode] as root (root)}
					<option value={root}>{root} {mode}</option>
				{/each}
			</select>
		</label>
	</div>
	{#if strayKey}
		<p class="hint licks__stray">Back to any key: {strayKey} is not a {mode} key.</p>
	{/if}

	<!-- A new lick or a new key is a new card: its own question, its own Space action. -->
	{#key `${item.id}:${keyPick}`}
		<LickCard {item} fixedKey={keyPick || null} />
	{/key}
</div>

<style lang="scss">
	.licks {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.licks__intro,
	.licks__stray {
		margin: 0;
		max-width: 60ch;
	}

	.licks__pick {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-4);

		.field__select {
			min-width: 12rem;
			max-width: 100%;
		}
	}
</style>
