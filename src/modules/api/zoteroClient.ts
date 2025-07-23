// Zotero HTTP client
// TODO: move all network code here
export async function fetchLibrary(): Promise<any> {
	// TODO fetch data from Zotero
	return {};
}

export function normalizeZoteroItem(raw: any): import('../models/interfaces').SyncNode {
	return {
		key: raw.key,
		type: raw.itemType,
		title: raw.title ?? '',
		parentKey: raw.parentKey,
		children: [],
		raw,
	} as any;
}
