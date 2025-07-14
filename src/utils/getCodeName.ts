/** Utility helpers for generating consistent power‑up identifiers. */
export function generatePowerupCode(name: string): string {
	return `zotero-connector-${name}`;
}

/** Create a human readable power‑up name. */
export function generatePowerupName(itemType: string): string {
	return `${itemType} (Zotero Connector)`;
}

/** Remove the plugin suffix from a power‑up name. */
export function stripPowerupSuffix(itemType: string): string {
	return itemType.replace(' (Zotero Connector)', '');
}
