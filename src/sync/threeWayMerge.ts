/**
 * Implements a three‑way merge algorithm.
 * @param localData - The current local data from RemNote (including user modifications).
 * @param remoteData - The fresh Zotero data.
 * @param baseData - The shadow copy from the previous sync.
 * @returns The merged data.
 */

export function isCoreField(key: string): boolean {
	// Core fields: always accept the remote version. TODO: identify which fields are core.
	const coreFields = ['title', 'abstractNote', 'date', 'publisher', 'url'];
	return coreFields.includes(key);
}

export function isChildContentField(key: string): boolean {
	// For example, "notes" is treated as child content that should merge.
	return key === 'notes';
}

export function mergeChildContent(local: any, remote: any, base: any): any {
	// If both local and remote store arrays (of notes), merge them by starting with remote
	// and then adding any local note that did not exist in the base copy.
	const merged = new Set<string>();
	if (Array.isArray(remote)) {
		remote.forEach((note) => merged.add(note));
	}
	if (Array.isArray(local)) {
		local.forEach((note) => {
			if (!base || (Array.isArray(base) && !base.includes(note))) {
				merged.add(note);
			}
		});
	}
	return Array.from(merged);
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
