export function getCode(name: string): string {
	return 'citationista-' + name;
}
export function getName(itemType: string) {
	return itemType + ' (Citationista)';
}
export function deriveName(itemType: string) {
	return itemType.replace(' (Citationista)', '');
}
