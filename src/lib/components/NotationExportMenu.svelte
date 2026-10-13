<script lang="ts">
	import { progression } from '$lib/stores/progression.svelte';
	import { view } from '$lib/stores/view.svelte';
	import { downloadMidi } from '$lib/export/midi';
	import { exportNotationPng, copyNotationImage, exportNotationPdf } from '$lib/export/notation';
	import { dismissable } from '$lib/actions/dismissable';

	interface Props {
		/** Mirror NotationView's staff mode so the export matches what's on screen. */
		showNotes: boolean;
	}
	let { showNotes }: Props = $props();

	let open = $state(false);
	let status = $state('');
	let busy = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function setStatus(message: string, autoClear = true) {
		clearTimeout(timer);
		status = message;
		if (autoClear) timer = setTimeout(() => (status = ''), 2500);
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(next)) open = false;
	}

	const opts = () => ({ showNotes, offset: view.offset });
	const snap = () => $state.snapshot(progression.current);

	async function withBusy(done: string, run: () => Promise<void>) {
		if (busy) return;
		busy = true;
		setStatus('Rendering…', false);
		try {
			await run();
			if (done) setStatus(done);
		} catch {
			setStatus('Export failed');
		} finally {
			busy = false;
		}
	}

	const png = () => withBusy('PNG saved', () => exportNotationPng(snap(), opts()));
	const pdf = () => withBusy('PDF saved', () => exportNotationPdf(snap(), opts()));
	const copy = () =>
		withBusy('', async () => {
			const r = await copyNotationImage(snap(), opts());
			setStatus(r === 'copied' ? 'Image copied' : 'Clipboard unavailable — downloaded');
		});
	function midi() {
		downloadMidi(snap());
		setStatus('MIDI saved');
	}

	$effect(() => () => clearTimeout(timer));
</script>

<div class="host" onfocusout={onFocusOut} use:dismissable={{ open, close: () => (open = false) }}>
	<button class="toggle" type="button" aria-expanded={open} onclick={() => (open = !open)}>Export</button>

	{#if open}
		<div class="vmenu">
			<button class="vmenu__row" type="button" disabled={busy} onclick={png}>Download PNG</button>
			<button class="vmenu__row" type="button" disabled={busy} onclick={copy}>Copy image</button>
			<button class="vmenu__row" type="button" disabled={busy} onclick={pdf}>Export PDF</button>
			<button class="vmenu__row" type="button" onclick={midi}>Export MIDI</button>
			{#if status}<p class="status hint" role="status">{status}</p>{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.host {
		position: relative;
		display: inline-block;
	}

	/* Matches NotationView's "Helper notes" toggle so the two sit as a pair. */
	.toggle {
		min-height: 38px;
		border: var(--rule-heavy) solid var(--ink);
		background: transparent;
		padding: 0 var(--space-3);
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink);
		transition: background-color var(--motion-fast) var(--motion-ease-out);

		&:hover {
			background: var(--wash);
		}

		@media (pointer: coarse) {
			min-height: var(--tap);
		}
	}

	.status {
		padding: var(--space-2) var(--space-3) var(--space-1);
		color: var(--color-accent);
	}
</style>
