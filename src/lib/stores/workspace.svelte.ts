// What Space plays, per route. The layout owns the one keydown listener (so the
// shortcut behaves the same everywhere); a route page registers what "play"
// means on it — Practice its drill, Learn the last question. Sketch registers
// nothing and gets the song.
//
// A registry rather than the layout importing every route's store: that would
// pull the Practice and Learn stores into the app shell and construct them on
// Sketch, where nothing uses them.

type Start = () => void;

class Workspace {
	private start: Start | null = null;

	/**
	 * Register this route's play action. Returns the release for onMount's
	 * cleanup; it only clears the slot if it still holds THIS action, so a route
	 * mounting before the old one unmounts can't be unregistered by it.
	 */
	register(fn: Start): () => void {
		this.start = fn;
		return () => {
			if (this.start === fn) this.start = null;
		};
	}

	/** Run the current route's play action; false when the route registered none. */
	play(): boolean {
		if (!this.start) return false;
		this.start();
		return true;
	}
}

export const workspace = new Workspace();
