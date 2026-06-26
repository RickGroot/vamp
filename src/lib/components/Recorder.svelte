<script lang="ts">
	import { recorder } from '$lib/stores/recorder.svelte';

	function fmt(ms: number): string {
		const total = Math.floor(ms / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function fmtTime(epoch: number): string {
		return new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="rec">
	<div class="rec__head">
		<span class="label">Record your solo</span>
		{#if recorder.takes.length > 0}
			<button class="reset" type="button" onclick={() => recorder.clear()}>Clear all</button>
		{/if}
	</div>

	{#if !recorder.supported}
		<p class="rec__note">Recording isn't supported in this browser.</p>
	{:else}
		<div class="rec__controls">
			{#if recorder.isRecording}
				<button class="recbtn recbtn--stop" type="button" onclick={() => recorder.stop()}>
					<span class="recbtn__dot" aria-hidden="true"></span>
					Stop
				</button>
				<span class="rec__elapsed" aria-live="polite">{fmt(recorder.elapsedMs)}</span>
			{:else}
				<button
					class="recbtn"
					type="button"
					disabled={recorder.state === 'requesting'}
					onclick={() => recorder.start()}
				>
					<span class="recbtn__dot" aria-hidden="true"></span>
					{recorder.state === 'requesting' ? 'Allow mic…' : 'Record'}
				</button>
			{/if}
		</div>

		{#if recorder.error}
			<p class="rec__error" role="alert">{recorder.error}</p>
		{/if}

		{#if recorder.takes.length > 0}
			<ul class="takes">
				{#each recorder.takes as take, i (take.id)}
					<li class="take">
						<span class="take__meta label">{fmtTime(take.createdAt)} · {fmt(take.durationMs)}</span>
						<!-- svelte-ignore a11y_media_has_caption -->
						<audio class="take__audio" controls src={take.url}></audio>
						<a class="take__act" href={take.url} download={recorder.fileName(take, i)} title="Download take"
							>↓</a
						>
						<button
							class="take__act"
							type="button"
							title="Delete take"
							aria-label="Delete take"
							onclick={() => recorder.remove(take.id)}>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}

		<p class="rec__note">
			Plays nothing back through the app — record yourself over the loop, then listen. Audio stays on
			your device; nothing is uploaded.
		</p>
	{/if}
</div>

<style lang="scss">
	.rec {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.rec__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.reset {
		border: 0;
		background: transparent;
		padding: 0;
		font-family: inherit;
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-faint);

		&:hover {
			color: var(--color-black);
		}
	}

	.rec__controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.recbtn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border: 1px solid var(--color-black);
		background: transparent;
		padding: var(--space-2) var(--space-4);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);

		&:hover:not(:disabled) {
			background: var(--color-black);
			color: var(--color-white);
		}

		&:disabled {
			color: var(--color-grey-400);
			border-color: var(--color-grey-400);
			cursor: not-allowed;
		}

		&__dot {
			width: 10px;
			height: 10px;
			border-radius: var(--radius-pill);
			background: var(--c-diminished);
		}

		&--stop {
			border-color: var(--c-diminished);
			color: var(--c-diminished);

			&:hover {
				background: var(--c-diminished);
				color: var(--color-white);
			}

			.recbtn__dot {
				background: currentColor;
				border-radius: 2px;
				animation: pulse 1s ease-in-out infinite;
			}
		}
	}

	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}

	.rec__elapsed {
		font-variant-numeric: tabular-nums;
		font-size: 1rem;
		color: var(--c-diminished);
	}

	.rec__error {
		margin: 0;
		font-size: 0.85rem;
		color: var(--c-diminished);
	}

	.rec__note {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-text-faint);
	}

	.takes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.take {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: var(--space-3);
	}

	.take__meta {
		white-space: nowrap;
	}

	.take__audio {
		width: 100%;
		height: 32px;
	}

	.take__act {
		width: 28px;
		height: 28px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		background: transparent;
		text-decoration: none;
		font-size: 1rem;
		line-height: 1;
		color: var(--color-text-muted);

		&:hover {
			border-color: var(--color-black);
			color: var(--color-black);
		}
	}
</style>
