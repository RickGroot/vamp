// Recording state: capture solo takes over the loop and keep them for the
// session so you can listen back. Takes live in memory as object URLs (and can
// be downloaded); they are intentionally not persisted across reloads — a follow-up
// could store the blobs in IndexedDB if longer-term takes are wanted.

import { browser } from '$app/environment';
import { extensionForType, MicRecorder, micErrorMessage } from '$lib/audio/recorder';

export type RecorderState = 'idle' | 'requesting' | 'recording';

export interface Take {
	id: string;
	url: string;
	type: string;
	/** epoch milliseconds */
	createdAt: number;
	/** recorded length in milliseconds */
	durationMs: number;
}

class RecorderStore {
	state = $state<RecorderState>('idle');
	error = $state<string | null>(null);
	takes = $state<Take[]>([]);
	elapsedMs = $state(0);

	private mic = new MicRecorder();
	private startedAt = 0;
	private timer: ReturnType<typeof setInterval> | undefined;

	get supported(): boolean {
		return browser && this.mic.supported;
	}

	get isRecording(): boolean {
		return this.state === 'recording';
	}

	async start(): Promise<void> {
		if (this.state !== 'idle' || !this.supported) return;
		this.error = null;
		this.state = 'requesting';
		try {
			await this.mic.start();
			this.state = 'recording';
			this.startedAt = performance.now();
			this.elapsedMs = 0;
			this.timer = setInterval(() => {
				this.elapsedMs = performance.now() - this.startedAt;
			}, 200);
		} catch (err) {
			this.state = 'idle';
			this.error = micErrorMessage(err);
		}
	}

	async stop(): Promise<void> {
		if (this.state !== 'recording') return;
		clearInterval(this.timer);
		const durationMs = performance.now() - this.startedAt;
		try {
			const { blob, type } = await this.mic.stop();
			const url = URL.createObjectURL(blob);
			this.takes = [
				{ id: crypto.randomUUID(), url, type, createdAt: Date.now(), durationMs },
				...this.takes
			];
		} catch (err) {
			this.error = micErrorMessage(err);
		} finally {
			this.state = 'idle';
			this.elapsedMs = 0;
		}
	}

	remove(id: string): void {
		const take = this.takes.find((t) => t.id === id);
		if (take) URL.revokeObjectURL(take.url);
		this.takes = this.takes.filter((t) => t.id !== id);
	}

	clear(): void {
		for (const take of this.takes) URL.revokeObjectURL(take.url);
		this.takes = [];
	}

	fileName(take: Take): string {
		// Derived from the take's timestamp so names are stable across deletions
		// (a list-position number changed after deletes and could collide).
		const d = new Date(take.createdAt);
		const pad = (n: number) => String(n).padStart(2, '0');
		const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		return `vamp-take-${stamp}.${extensionForType(take.type)}`;
	}
}

export const recorder = new RecorderStore();
