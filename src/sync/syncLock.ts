/** Simple in-memory flag to prevent concurrent syncs. */
let syncing = false;

/** Attempt to grab the lock. */
export function tryAcquire(): boolean {
	if (syncing) {
		return false;
	}
	syncing = true;
	return true;
}

/** Release the sync lock. */
export function release(): void {
	syncing = false;
}

/** Check if a sync is currently running. */
export function isSyncing(): boolean {
        return syncing;
}
