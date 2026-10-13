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
							<p class="hint info__relation">
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

	/* A margin note on the chart: what this stretch of bars is. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		border: 0;
		border-radius: 0;
		background: var(--wash);
		padding: 0 var(--space-3);
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--ink);

		&:hover,
		&[aria-expanded='true'] {
			background: var(--ink);
			color: var(--ground);

			.chip__bars {
				color: inherit;
			}
		}

		@media (pointer: coarse) {
			min-height: var(--tap);
		}
	}

	.chip__dot {
		display: none;
	}

	.chip__bars {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
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
		padding: 0 var(--space-4);
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: 900;
		font-size: 1.5rem;
		line-height: 1.05;
		color: var(--ink);
	}

	.info__relation {
		margin: var(--space-1) 0 0;
		padding: 0 var(--space-4);
		color: var(--color-text-faint);
	}

	.info__text {
		margin: var(--space-2) 0 0;
		padding: 0 var(--space-4);
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--color-text);

		&--listen {
			color: var(--color-text-muted);
		}
	}

	.info__actions {
		margin-top: var(--space-3);
		border-top: var(--rule-heavy) solid var(--ink);
		padding-top: var(--space-1);
		padding-bottom: var(--space-1);
	}
</style>
