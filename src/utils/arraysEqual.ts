export function arraysEqual(a: string[] | null, b: string[] | null): boolean {
	// Utility function to compare arrays (order-insensitive)
	if (a === b) return true;
	if ((a && !b) || (!a && b)) return false;
	if (a && b && a.length !== b.length) return false;
	if (a && b) {
		const sortedA = [...a].sort();
		const sortedB = [...b].sort();
		for (let i = 0; i < sortedA.length; i++) {
			if (sortedA[i] !== sortedB[i]) return false;
		}
		return true;
	}
	return false;
}
