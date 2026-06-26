// Shared AudioContext + mobile audio lifecycle.
//
// Tone owns the single AudioContext; smplr instruments are created against
// Tone's raw context so playback and the Transport clock share one timebase.
//
// Mobile reality handled here:
//  - Audio can only start from a user gesture -> `unlockAudio()` must be called
//    from a pointer/key handler (the "tap to start" button).
//  - iOS Safari drops the context to 'suspended'/'interrupted' on lock or
//    backgrounding and can get stuck; we retry resume() on visibility return.

import * as Tone from 'tone';

let lifecycleWired = false;
let everUnlocked = false;

/** The shared native AudioContext (created/owned by Tone). */
export function getRawContext(): AudioContext {
	return Tone.getContext().rawContext as unknown as AudioContext;
}

/**
 * Resume/unlock audio. MUST be called synchronously from a real user gesture
 * (pointerdown/click/keydown), otherwise mobile browsers silently keep it muted.
 */
export async function unlockAudio(): Promise<void> {
	await Tone.start();
	everUnlocked = true;
	wireLifecycle();
}

/** True when audio has been unlocked and the context is actively running. */
export function isRunning(): boolean {
	return everUnlocked && getRawContext().state === 'running';
}

function wireLifecycle(): void {
	if (lifecycleWired || typeof document === 'undefined') return;
	lifecycleWired = true;

	const ctx = getRawContext();
	const tryResume = () => {
		if (document.visibilityState === 'visible' && ctx.state !== 'running') {
			// Best-effort: on iOS this can be a no-op while 'interrupted'; the next
			// real user gesture (which calls unlockAudio again) recovers it.
			ctx.resume().catch(() => {});
		}
	};

	document.addEventListener('visibilitychange', tryResume);
	// Not all engines fire 'statechange', so guard the call.
	ctx.addEventListener?.('statechange', tryResume);
}
