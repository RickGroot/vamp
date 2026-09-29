<script lang="ts">
	// What a blank canvas says: pick up a sketch you were working on (saved or
	// not — anything New or an example replaced is remembered), or start from a
	// shape that's fun to play over. Shown only while the canvas has no chords;
	// the first chord you type makes it step aside.
	import { progression } from '$lib/stores/progression.svelte';
	import { PRESETS } from '$lib/model/presets';
	import { EXAMPLES } from '$lib/model/examples';
	import { chordPreview } from '$lib/storage/recent';

	const recent = $derived(progression.recent.slice(0, 3));

	const when = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	function ago(at: number): string {
		if (!at) return '';
		const minutes = Math.round((at - Date.now()) / 60000);
		if (Math.abs(minutes) < 60) return when.format(minutes, 'minute');
		const hours = Math.round(minutes / 60);
		if (Math.abs(hours) < 24) return when.format(hours, 'hour');
		return when.format(Math.round(hours / 24), 'day');
	}

	const ii_V_I = PRESETS.find((p) => p.id === 'jazz-251');
	const blues = EXAMPLES.find((e) => e.title === '12-Bar Blues in A');
	const risingSun = EXAMPLES.find((e) => e.title === 'House of the Rising Sun');
</script>

<section class="start" aria-labelledby="start-title">
	<h2 class="start__title" id="start-title">Start a tune</h2>

	{#if recent.length > 0}
		<p class="label start__group">Pick up where you left off</p>
		<ul class="start__recent">
			{#each recent as r (r.song.id)}
				<li class="sketch">
					<button class="sketch__open" type="button" onclick={() => progression.resumeSketch(r.song.id)}>
						<span class="sketch__name">{r.song.name?.trim() || 'Untitled'}</span>
						<span class="sketch__chords">{chordPreview(r.song)}</span>
						<span class="sketch__when">{ago(r.at)}</span>
					</button>
					<button
						class="sketch__forget"
						type="button"
						aria-label={`Forget ${r.song.name?.trim() || 'this sketch'}`}
						title="Forget this sketch"
						onclick={() => progression.forgetSketch(r.song.id)}
					>
						<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
							><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg
						>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="label start__group">{recent.length ? 'Or start from' : 'Start from'}</p>
	<div class="start__seeds">
		{#if ii_V_I}
			<button class="seed" style:--q="var(--c-minor)" style:--q2="var(--c-dominant)" type="button" onclick={() => progression.applyPreset(ii_V_I, 'C')}>
				<span class="seed__swatch" aria-hidden="true"></span>ii–V–I in C
			</button>
		{/if}
		{#if blues}
			<button class="seed" style:--q="var(--c-dominant)" style:--q2="var(--c-dominant)" type="button" onclick={() => progression.loadExample(blues)}>
				<span class="seed__swatch" aria-hidden="true"></span>12-bar blues
			</button>
		{/if}
		{#if risingSun}
			<button class="seed" style:--q="var(--c-minor)" style:--q2="var(--c-major)" type="button" onclick={() => progression.loadExample(risingSun)}>
				<span class="seed__swatch" aria-hidden="true"></span>House of the Rising Sun
			</button>
		{/if}
		<button class="seed seed--spot" style:--q="var(--spot)" style:--q2="var(--sun)" type="button" onclick={() => progression.inspire()}>
			<span class="seed__swatch" aria-hidden="true"></span>Surprise me
		</button>
	</div>

	<p class="hint start__hint">…or type a chord in bar 1 — try <span class="start__try">Dm7</span>.</p>
</section>

<style lang="scss">
	.start {
		margin-top: var(--space-6);
		padding: var(--space-6);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		background:
			radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--sun) 22%, transparent), transparent 60%),
			var(--paper);
	}

	.start__title {
		font-family: var(--font-hand);
		font-weight: 400;
		font-size: 2rem;
		line-height: 1.1;
		text-shadow: var(--text-glow);
	}

	.start__group {
		margin: var(--space-4) 0 var(--space-2);
	}

	.start__recent {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sketch {
		position: relative;
	}

	.sketch__open {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		min-height: var(--tap);
		padding: var(--space-2) var(--space-8) var(--space-2) var(--space-3);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		background: var(--ground);
		font-family: inherit;
		text-align: left;
		color: var(--ink);
		transition:
			transform var(--motion-fast) var(--motion-pop),
			border-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--ink);
			transform: translateY(-1px);
		}
	}

	.sketch__name {
		font-family: var(--font-hand);
		font-size: 1.375rem;
		line-height: 1.15;
	}

	.sketch__chords {
		font-size: 0.875rem;
		color: var(--ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sketch__when {
		font-size: 0.8125rem;
		color: var(--ink-3);
	}

	.sketch__forget {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--ink-3);

		&:hover {
			background: var(--wash);
			color: var(--ink);
		}

		@media (pointer: coarse) {
			width: 40px;
			height: 40px;
			top: 2px;
			right: 2px;
		}
	}

	.start__seeds {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.seed {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
		padding: 0 var(--space-4) 0 var(--space-2);
		border: 1px solid var(--edge);
		border-radius: var(--radius-pill);
		background: var(--ground);
		font-family: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--ink);
		transition:
			transform var(--motion-fast) var(--motion-pop),
			border-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			border-color: var(--ink);
			transform: translateY(-1px) rotate(-1deg);
		}
	}

	/* The shape of the progression in its colours. */
	.seed__swatch {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--q) 0 55%, var(--q2) 55% 100%);
		box-shadow: var(--lift);
	}

	.start__hint {
		margin: var(--space-4) 0 0;
	}

	.start__try {
		font-family: var(--font-hand);
		font-size: 1.2em;
		color: var(--ink);
	}

	@media (max-width: 600px) {
		.start {
			padding: var(--space-4);
		}

		.start__title {
			font-size: 1.625rem;
		}
	}
</style>
