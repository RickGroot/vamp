<script lang="ts">
	import type { Detection } from '$lib/model/analysis';
	import type { KeyInfo } from '$lib/model/key';
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { scales } from '$lib/stores/scales.svelte';
	import { displayChord } from '$lib/audio/transpose';
	import { dismissable } from '$lib/actions/dismissable';

	interface Props {
		detections: Detection[];
		keyInfo: KeyInfo;
		/** Hover/focus hint: the bar range a chip covers (null = clear). */
		onhint: (range: { start: number; end: number } | null) => void;
	}
	let { detections, keyInfo, onhint }: Props = $props();

	const VISIBLE = 6;
	let expanded = $state(false);
	/** Which chip's info popover is open (`patternId:startSlot`), one at a time. */
	let openId = $state<string | null>(null);

	const shown = $derived(expanded ? detections : detections.slice(0, VISIBLE));
	const idOf = (d: Detection) => `${d.patternId}:${d.startSlot}`;

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) openId = null;
	}

	function loopBars(d: Detection) {
		progression.setLoopRange(d.startBar, d.endBar);
		openId = null;
	}

	function showScales(concert: string) {
		scales.showForChord(concert);
		openId = null;
	}
</script>

{#if detections.length > 0}
	<div class="insights" aria-label="Recognised progressions">
		<span class="label">Patterns</span>
		{#each shown as d (idOf(d))}
			<div
				class="host"
				onfocusout={onFocusOut}
				use:dismissable={{ open: openId === idOf(d), close: () => (openId = null) }}
			>
				<button
					class="chip"
					type="button"
					aria-expanded={openId === idOf(d)}
					onclick={() => (openId = openId === idOf(d) ? null : idOf(d))}
					onmouseenter={() => onhint({ start: d.startBar, end: d.endBar })}
					onmouseleave={() => onhint(null)}
					onfocus={() => onhint({ start: d.startBar, end: d.endBar })}
					onblur={() => onhint(null)}
				>
					<span class="chip__dot" aria-hidden="true"></span>
					{d.name}{#if d.relation}&nbsp;in {displayChord(d.localTonic, view.offset)}{/if}{#if d.repeats > 1}&nbsp;×{d.repeats}{/if}
					<span class="chip__bars">bars {d.startBar + 1}–{d.endBar + 1}</span>
				</button>

				{#if openId === idOf(d)}
					<div class="vmenu info">
						<p class="info__formula">
							{d.formula} · {d.chords.map((c) => displayChord(c, view.offset)).join(' → ')}
						</p>
						{#if d.relation}
							<p class="label info__relation">
								In {displayChord(d.localTonic, view.offset)} — the {d.relation} of {keyInfo.tonic}
								{keyInfo.mode}
							</p>
						{/if}
						<p class="info__text">{d.blurb}</p>
						<p class="info__text">{d.why}</p>
						<p class="info__text info__text--listen">{d.listen}</p>
						<div class="info__actions">
							<button class="vmenu__row" type="button" onclick={() => loopBars(d)}>
								Loop bars {d.startBar + 1}–{d.endBar + 1}
							</button>
							{#if !view.showRoman}
								<button class="vmenu__row" type="button" onclick={() => view.setShowRoman(true)}>
									Show Roman numerals
								</button>
							{/if}
							{#each [...new Set(d.chords)] as c (c)}
								<button class="vmenu__row" type="button" onclick={() => showScales(c)}>
									Scales for {displayChord(c, view.offset)}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/each}
		{#if detections.length > VISIBLE}
			<button class="chip chip--more" type="button" onclick={() => (expanded = !expanded)}>
				{expanded ? 'less' : `+${detections.length - VISIBLE} more`}
			</button>
		{/if}
	</div>
{/if}

<style lang="scss">
	.insights {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.host {
		position: relative;
		display: inline-block;
	}

	/* Quiet-control voice (matches the header's art toggle), pill-shaped. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: transparent;
		padding: var(--space-1) var(--space-2);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}
	}

	.chip__dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
		background: var(--c-suspended); /* informational blue — unclaimed by loop/playhead */
	}

	.chip__bars {
		color: var(--color-text-faint);
	}

	/* Info popover: reuses the global .vmenu, but chips sit mid-page — anchor
	   LEFT (the global rule is right:0 for the toolbar menus) and cap width. */
	.info {
		left: 0;
		right: auto;
		max-width: 320px;
		padding-top: var(--space-3);
	}

	.info__formula {
		margin: 0;
		padding: 0 var(--space-3);
		font-size: 0.9rem;
		color: var(--color-text);
	}

	.info__relation {
		margin: var(--space-1) 0 0;
		padding: 0 var(--space-3);
		color: var(--color-text-faint);
	}

	.info__text {
		margin: var(--space-2) 0 0;
		padding: 0 var(--space-3);
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--color-text);

		&--listen {
			color: var(--color-text-muted);
		}
	}

	.info__actions {
		margin-top: var(--space-3);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-1);
		padding-bottom: var(--space-1);
	}
</style>
