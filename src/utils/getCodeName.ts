// Rename summary: getCode -> generatePowerupCode; getName -> generatePowerupName; deriveName -> stripPowerupSuffix
export function generatePowerupCode(name: string): string {
        return 'citationista-' + name;
}
export function generatePowerupName(itemType: string) {
        return itemType + ' (Citationista)';
}
export function stripPowerupSuffix(itemType: string) {
        return itemType.replace(' (Citationista)', '');
}
