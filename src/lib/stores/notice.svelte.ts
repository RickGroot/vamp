// The one transient notice at the bottom of the screen ("Saved …", "Replaced …
// · Undo"). Session-only. A newer notice replaces the old one — there is never a
// stack of toasts to read or dismiss.
//
// A notice with an action stays long enough to reach, and holds while it's
// hovered or focused (WCAG 2.2.1: a timed control you're using must not vanish
// under you).

export interface NoticeAction {
	label: string;
	run: () => void;
}

export interface Notice {
	id: number;
	text: string;
	action?: NoticeAction;
}

const PLAIN_MS = 1800;
const ACTION_MS = 6000;

class NoticeStore {
	current = $state<Notice | null>(null);

	private seq = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private held = false;

	/** Show a notice; returns its id so the owner can dismiss only its own. */
	show(text: string, action?: NoticeAction): number {
		const id = ++this.seq;
		this.current = { id, text, action };
		this.held = false;
		this.arm();
		return id;
	}

	/** Dismiss the current notice — or, given an id, only if it's still that one. */
	dismiss(id?: number): void {
		if (!this.current || (id !== undefined && this.current.id !== id)) return;
		clearTimeout(this.timer);
		this.current = null;
	}

	/** Run the action once, then dismiss. */
	act(): void {
		const action = this.current?.action;
		this.dismiss();
		action?.run();
	}

	/** Pointer or focus is on the notice: stop the clock. */
	hold(): void {
		this.held = true;
		clearTimeout(this.timer);
	}

	release(): void {
		if (!this.held) return;
		this.held = false;
		this.arm();
	}

	private arm(): void {
		clearTimeout(this.timer);
		const id = this.current?.id;
		if (id === undefined) return;
		const ms = this.current?.action ? ACTION_MS : PLAIN_MS;
		this.timer = setTimeout(() => this.dismiss(id), ms);
	}
}

export const notice = new NoticeStore();
