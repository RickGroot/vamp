// A tiny shared cursor channel for art mode. The existing aurora $effect in
// +page.svelte writes the smoothed position (mx/my, normalised 0..1) and the
// last pointerdown (pingX/pingY in CSS px, pingT = timestamp); the generative
// lattice READS these every animation frame. One pointer channel, no duplicate
// listeners anywhere.

class Cursor {
	/** Smoothed cursor position, normalised 0..1 across the viewport. */
	mx = $state(0.5);
	my = $state(0.5);
	/** Last pointerdown: position in CSS px + timestamp (performance.now). */
	pingX = $state(0);
	pingY = $state(0);
	pingT = $state(0);
}

export const cursor = new Cursor();
