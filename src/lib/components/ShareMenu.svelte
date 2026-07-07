<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { buildShareUrl } from '$lib/storage/share';
	import { downloadMidi } from '$lib/export/midi';
	import { exportWav } from '$lib/export/audio';
	import { downloadBackup } from '$lib/storage/backup';
	import { dismissable } from '$lib/actions/dismissable';

	let open = $state(false);
	let status = $state('');
	let rendering = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Single status setter that always clears the previous timer — overlapping
	// flashes used to wipe newer messages when a stale timeout fired.
	function setStatus(message: string, autoClear = true) {
		clearTimeout(timer);
		timer = undefined;
		status = message;
		if (autoClear) timer = setTimeout(() => (status = ''), 2500);
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}

	async function onLink() {
		try {
			await navigator.clipboard.writeText(buildShareUrl($state.snapshot(progression.current)));
			setStatus('Link copied');
		} catch {
			setStatus('Copy failed');
		}
	}

	function onMidi() {
		downloadMidi($state.snapshot(progression.current));
		setStatus('MIDI saved');
	}

	async function onWav() {
		if (rendering) return;
		rendering = true;
		setStatus('Rendering…', false); // sticky until the render settles
		try {
			await exportWav($state.snapshot(progression.current));
			setStatus('WAV saved');
		} catch {
			setStatus('Render failed');
		} finally {
			rendering = false;
		}
	}

	async function onJson() {
		try {
			await downloadBackup();
			setStatus('Backup saved');
		} catch {
			setStatus('Backup failed');
		}
	}

	$effect(() => () => clearTimeout(timer));
</script>

<div class="host" onfocusout={onFocusOut} use:dismissable={{ open, close: () => (open = false) }}>
	<button class="bar-btn" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		Share / export
	</button>

	{#if open}
		<div class="vmenu">
			<button class="vmenu__row" type="button" onclick={onLink}>Copy share link</button>
			<button class="vmenu__row" type="button" onclick={onMidi}>Export MIDI</button>
			<button class="vmenu__row" type="button" disabled={rendering} onclick={onWav}>
				{rendering ? 'Rendering…' : 'Render WAV'}
			</button>
			<button class="vmenu__row" type="button" onclick={onJson}>Export JSON backup</button>
			{#if status}<p class="status label" role="status">{status}</p>{/if}
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
