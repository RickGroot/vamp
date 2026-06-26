// Microphone capture via the platform MediaRecorder — no dependencies.
//
// Privacy: audio is recorded into an in-memory Blob and never leaves the device.
// Recording needs a one-time microphone permission grant; the mic stream is fully
// released (tracks stopped) the moment a take finishes.

export interface RecordingResult {
	blob: Blob;
	/** MIME type the browser actually produced (e.g. 'audio/webm'). */
	type: string;
}

/** Human-readable reason for a failed mic start. */
export function micErrorMessage(err: unknown): string {
	const name = (err as { name?: string })?.name;
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return 'Microphone permission was denied. Allow mic access in your browser to record.';
		case 'NotFoundError':
		case 'OverconstrainedError':
			return 'No microphone was found.';
		case 'NotReadableError':
			return 'The microphone is in use by another app.';
		default:
			return (err as { message?: string })?.message ?? 'Could not start recording.';
	}
}

export class MicRecorder {
	private recorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];

	/** Whether the platform supports mic capture + recording. */
	get supported(): boolean {
		return (
			typeof navigator !== 'undefined' &&
			!!navigator.mediaDevices?.getUserMedia &&
			typeof MediaRecorder !== 'undefined'
		);
	}

	get isRecording(): boolean {
		return this.recorder?.state === 'recording';
	}

	/** Request the mic and begin recording. Throws on permission/device errors. */
	async start(): Promise<void> {
		if (this.recorder) return;
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		this.chunks = [];
		const recorder = new MediaRecorder(this.stream);
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) this.chunks.push(event.data);
		};
		this.recorder = recorder;
		recorder.start();
	}

	/** Stop recording, release the mic, and resolve with the captured audio. */
	stop(): Promise<RecordingResult> {
		return new Promise((resolve, reject) => {
			const recorder = this.recorder;
			if (!recorder) {
				reject(new Error('Not recording.'));
				return;
			}
			recorder.onstop = () => {
				const type = this.chunks[0]?.type || recorder.mimeType || 'audio/webm';
				const blob = new Blob(this.chunks, { type });
				this.cleanup();
				resolve({ blob, type });
			};
			recorder.stop();
		});
	}

	/** Abort without producing a take (e.g. on teardown). */
	cancel(): void {
		try {
			this.recorder?.stop();
		} catch {
			/* ignore */
		}
		this.cleanup();
	}

	private cleanup(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.recorder = null;
		this.chunks = [];
	}
}

/** Pick a sensible download file extension for a recording MIME type. */
export function extensionForType(type: string): string {
	if (type.includes('ogg')) return 'ogg';
	if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'm4a';
	if (type.includes('mpeg')) return 'mp3';
	if (type.includes('wav')) return 'wav';
	return 'webm';
}
