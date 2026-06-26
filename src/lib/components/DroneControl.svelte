<script lang="ts">
	import { droneState, DRONE_NOTES, DRONE_OCTAVES } from '$lib/stores/drone.svelte';

	interface Props {
		/** Pitch class to use when the root is set to follow the key. */
		defaultRoot: string;
	}

	let { defaultRoot }: Props = $props();

	const activeRoot = $derived(droneState.root ?? defaultRoot);

	function onRoot(value: string): void {
		droneState.setRoot(value === 'auto' ? null : value, defaultRoot);
	}
</script>

<div class="drone">
	<div class="drone__main">
		<button
			class="dronebtn"
			class:dronebtn--on={droneState.on}
			type="button"
			aria-pressed={droneState.on}
			onclick={() => droneState.toggle(defaultRoot)}
		>
			<span class="dronebtn__wave" aria-hidden="true"></span>
			{droneState.on ? `Drone ${activeRoot}` : 'Drone'}
		</button>

		<div class="field">
			<label class="label" for="drone-root">Root</label>
			<select
				id="drone-root"
				class="field__select drone__select"
				value={droneState.root ?? 'auto'}
				onchange={(e) => onRoot((e.target as HTMLSelectElement).value)}
			>
				<option value="auto">Key ({defaultRoot})</option>
				{#each DRONE_NOTES as note (note)}
					<option value={note}>{note}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label class="label" for="drone-oct">Octave</label>
			<select
				id="drone-oct"
				class="field__select drone__select"
				value={droneState.octave}
				onchange={(e) =>
					droneState.setOctave(Number((e.target as HTMLSelectElement).value), defaultRoot)}
			>
				{#each DRONE_OCTAVES as o (o.value)}
					<option value={o.value}>{o.label}</option>
				{/each}
			</select>
		</div>

		<button
			class="toggle"
			class:toggle--on={droneState.fifth}
			type="button"
			aria-pressed={droneState.fifth}
			title="Add the perfect fifth"
			onclick={() => droneState.setFifth(!droneState.fifth)}>+5th</button
		>
	</div>

	<div class="drone__vol">
		<label class="label" for="drone-vol">Level</label>
		<input
			id="drone-vol"
			class="fader"
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={droneState.volume}
			oninput={(e) => droneState.setVolume(Number((e.target as HTMLInputElement).value))}
		/>
	</div>
</div>

<style lang="scss">
	.drone {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.drone__main {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.dronebtn {
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
		min-width: 9ch;

		&:hover {
			background: var(--color-black);
			color: var(--color-white);
		}

		&--on {
			background: var(--c-suspended);
			border-color: var(--c-suspended);
			color: var(--color-white);

			&:hover {
				background: var(--c-suspended);
			}
		}

		&__wave {
			width: 10px;
			height: 10px;
			border-radius: var(--radius-pill);
			background: var(--c-suspended);
		}

		&--on .dronebtn__wave {
			background: currentColor;
			animation: breathe 2s ease-in-out infinite;
		}
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}

	.drone__select {
		font-size: 1rem;
		min-width: 7ch;
	}

	.toggle {
		border: 1px solid var(--color-border);
		background: transparent;
		padding: var(--space-2) var(--space-3);
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

		&--on {
			background: var(--c-suspended);
			border-color: var(--c-suspended);
			color: var(--color-white);
		}
	}

	.drone__vol {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.fader {
		width: 160px;
		max-width: 100%;
		accent-color: var(--c-suspended);
		cursor: pointer;
	}
</style>
