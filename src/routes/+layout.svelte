<script lang="ts">
	import '../app.scss';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let { children } = $props();

	let updateReady = $state(false);
	let reloadSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

	onMount(async () => {
		if (!browser) return;
		try {
			const { registerSW } = await import('virtual:pwa-register');
			reloadSW = registerSW({
				immediate: true,
				onNeedRefresh: () => (updateReady = true)
			});
		} catch {
			// Service worker not available (e.g. dev) — app still works online.
		}
	});
</script>

{@render children()}

{#if updateReady}
	<div class="update" role="status">
		<span class="label">New version available</span>
		<button class="update__btn" type="button" onclick={() => reloadSW?.(true)}>Reload</button>
	</div>
{/if}

<style lang="scss">
	.update {
		position: fixed;
		left: 50%;
		bottom: var(--space-6);
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: var(--color-black);
		color: var(--color-white);
		z-index: 10;
	}

	.update :global(.label) {
		color: var(--color-white);
	}

	.update__btn {
		border: 1px solid var(--color-white);
		background: transparent;
		color: var(--color-white);
		padding: var(--space-1) var(--space-3);
		font-family: inherit;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;

		&:hover {
			background: var(--color-orange);
			border-color: var(--color-orange);
		}
	}
</style>
