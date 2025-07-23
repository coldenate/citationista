export interface Snapshot {
	version: 1;
	timestamp: number;
	items: unknown[];
	collections: unknown[];
}

export async function loadSnapshot(): Promise<Snapshot | null> {
	// TODO: implement persistence
	return null;
}

export async function saveSnapshot(data: Snapshot): Promise<void> {
	// TODO: implement persistence
}
