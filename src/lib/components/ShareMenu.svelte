<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { buildShareUrl } from '$lib/storage/share';
	import { downloadMidi } from '$lib/export/midi';
	import { exportWav } from '$lib/export/audio';
	import { downloadBackup } from '$lib/storage/backup';

	let open = $state(false);
	let status = $state('');

	function flash(message: string) {
		status = message;
		setTimeout(() => (status = ''), 2500);
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}

	async function onLink() {
		try {
			await navigator.clipboard.writeText(buildShareUrl($state.snapshot(progression.current)));
			flash('Link copied');
		} catch {
			flash('Copy failed');
		}
	}

	function onMidi() {
		downloadMidi($state.snapshot(progression.current));
		flash('MIDI saved');
	}

	async function onWav() {
		flash('Rendering…');
		try {
			await exportWav($state.snapshot(progression.current));
			flash('WAV saved');
		} catch {
			flash('Render failed');
		}
	}

	async function onJson() {
		await downloadBackup();
		flash('Backup saved');
	}
</script>

<div class="host" onfocusout={onFocusOut}>
	<button class="bar-btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		Share / export
	</button>

	{#if open}
		<div class="vmenu" role="menu">
			<button class="vmenu__row" type="button" onclick={onLink}>Copy share link</button>
			<button class="vmenu__row" type="button" onclick={onMidi}>Export MIDI</button>
			<button class="vmenu__row" type="button" onclick={onWav}>Render WAV</button>
			<button class="vmenu__row" type="button" onclick={onJson}>Export JSON backup</button>
			{#if status}<p class="status label">{status}</p>{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.host {
		position: relative;
		display: inline-block;
	}

	.status {
		padding: var(--space-2) var(--space-3) var(--space-1);
		color: var(--color-accent);
	}
</style>
