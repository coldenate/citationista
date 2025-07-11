// Rename summary: getCode -> generatePowerupCode; getName -> generatePowerupName; deriveName -> stripPowerupSuffix
export function generatePowerupCode(name: string): string {
	return `zotero-connector-${name}`;
}
export function generatePowerupName(itemType: string) {
	return `${itemType} (Zotero Connector)`;
}
export function stripPowerupSuffix(itemType: string) {
	return itemType.replace(' (Zotero Connector)', '');
}
