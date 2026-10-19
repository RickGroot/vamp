// The key you hear as home in a song, picked in Learn, by song id, for the
// session. Your song and the Lab read and write the same pick, so a key chosen
// in one is the key of the other, and "Open in Sketch" and back keeps it.
// Never persisted: the detector's guess (inferKey) is the default every launch.
//
// Plain module state, read once when a mode mounts (only one mode is on screen
// at a time); each mode mirrors it into its own $state.

import type { KeyInfo } from '$lib/model/key';

export const pickedKeys = new Map<string, KeyInfo>();
