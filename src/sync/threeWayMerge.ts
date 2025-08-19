import type { Tag, ZoteroItemData } from '../types/zotero.api';

/**
 * Implements a three‑way merge algorithm.
 * @param localData - The current local data from RemNote (including user modifications).
 * @param remoteData - The fresh Zotero data.
 * @param baseData - The shadow copy from the previous sync.
 * @returns The merged data.
 */

// Type for array-based child content (notes and tags)
type ChildContentEntry = string | Tag | Record<string, unknown>;

export function isCoreField(key: string): boolean {
	// Core bibliographic metadata should always prefer the remote value
	// to ensure Zotero remains the source of truth.
	const coreFields = [
		'key',
		'itemType',
		'creators',
		'title',
		'publicationTitle',
		'bookTitle',
		'publisher',
		'date',
		'dateAdded',
		'dateModified',
		'url',
		'DOI',
		'ISSN',
		'ISBN',
		'linkMode',
		'filename',
		'path',
		'md5',
	];
	return coreFields.includes(key);
}

export function isChildContentField(key: string): boolean {
	// Notes and tags should be merged rather than overwritten.
	return key === 'notes' || key === 'tags';
}

export function mergeChildContent(
	local: ChildContentEntry[] | undefined,
	remote: ChildContentEntry[] | undefined,
	base: ChildContentEntry[] | undefined
): ChildContentEntry[] {
	// Handles merging of array based child content like notes and tags.
	const merged: ChildContentEntry[] = [];
	const seen = new Set<string>();

	const addEntry = (entry: ChildContentEntry) => {
		if (!entry) return;
		const key = typeof entry === 'string' ? entry : JSON.stringify(entry);
		if (!seen.has(key)) {
			seen.add(key);
			merged.push(entry);
		}
	};

	if (Array.isArray(remote)) {
		remote.forEach(addEntry);
	}

	if (Array.isArray(local)) {
		local.forEach((entry) => {
			const key = typeof entry === 'string' ? entry : JSON.stringify(entry);
			if (
				!base ||
				(Array.isArray(base) &&
					!base.some((b) =>
						typeof b === 'string' ? b === entry : JSON.stringify(b) === key
					))
			) {
				addEntry(entry);
			}
		});
	}

	return merged;
}

export function threeWayMerge(
	localData: Partial<ZoteroItemData> | undefined,
	remoteData: Partial<ZoteroItemData> | undefined,
	baseData: Partial<ZoteroItemData> | undefined
): Partial<ZoteroItemData> {
	const mergedData: Partial<ZoteroItemData> = { ...localData };
	const allKeys = new Set([...Object.keys(remoteData || {}), ...Object.keys(localData || {})]);
	allKeys.forEach((key) => {
		const remoteVal = remoteData ? remoteData[key as keyof ZoteroItemData] : undefined;
		const localVal = localData ? localData[key as keyof ZoteroItemData] : undefined;
		const baseVal = baseData ? baseData[key as keyof ZoteroItemData] : undefined;

		if (isCoreField(key)) {
			// For core fields, always adopt the remote value.
			(mergedData as Record<string, unknown>)[key] = remoteVal;
		} else if (isChildContentField(key)) {
			// Merge arrays (like notes) intelligently.
			(mergedData as Record<string, unknown>)[key] = mergeChildContent(
				localVal as ChildContentEntry[] | undefined,
				remoteVal as ChildContentEntry[] | undefined,
				baseVal as ChildContentEntry[] | undefined
			);
		} else {
			// For other fields, if remote changed relative to base, use remote; else keep local.
			(mergedData as Record<string, unknown>)[key] =
				baseVal !== undefined && remoteVal !== baseVal ? remoteVal : localVal;
		}
	});
	return mergedData;
}
