/**
 * Implements a three‑way merge algorithm.
 * @param localData - The current local data from RemNote (including user modifications).
 * @param remoteData - The fresh Zotero data.
 * @param baseData - The shadow copy from the previous sync.
 * @returns The merged data.
 */

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

export function mergeChildContent(local: any, remote: any, base: any): any {
	// Handles merging of array based child content like notes and tags.
	const merged: any[] = [];
	const seen = new Set<string>();

	const addEntry = (entry: any) => {
		if (!entry) return;
		const key = typeof entry === 'string' ? entry : canonicalSerialize(entry);
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

export function threeWayMerge(localData: any, remoteData: any, baseData: any): any {
	const mergedData: any = { ...localData };
	const allKeys = new Set([...Object.keys(remoteData || {}), ...Object.keys(localData || {})]);
	allKeys.forEach((key) => {
		const remoteVal = remoteData ? remoteData[key] : undefined;
		const localVal = localData ? localData[key] : undefined;
		const baseVal = baseData ? baseData[key] : undefined;

		if (isCoreField(key)) {
			// For core fields, always adopt the remote value.
			mergedData[key] = remoteVal;
		} else if (isChildContentField(key)) {
			// Merge arrays (like notes) intelligently.
			mergedData[key] = mergeChildContent(localVal, remoteVal, baseVal);
		} else {
			// For other fields, if remote changed relative to base, use remote; else keep local.
			mergedData[key] = baseVal !== undefined && remoteVal !== baseVal ? remoteVal : localVal;
		}
	});
	return mergedData;
}
