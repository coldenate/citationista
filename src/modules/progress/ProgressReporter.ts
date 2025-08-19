export type Phase = 'index' | 'diff' | 'merge' | 'apply' | 'hydrate' | 'finalize';

const defaultWeights: Record<Phase, number> = {
	index: 0.1,
	diff: 0.1,
	merge: 0.15,
	apply: 0.35,
	hydrate: 0.25,
	finalize: 0.05,
};

export class ProgressReporter {
	private perLibraryProgress: Record<string, number> = {};
	private weights: Record<Phase, number>;

	constructor(weights: Partial<Record<Phase, number>> = {}) {
		this.weights = { ...defaultWeights, ...weights } as Record<Phase, number>;
	}

	// Monotonic per-library progress update (never decreases)
	update(libraryKey: string, phase: Phase, phaseRatio: number): number {
		const clamped = Math.max(0, Math.min(1, phaseRatio));
		const weighted = this.weights[phase] * clamped;
		const prev = this.perLibraryProgress[libraryKey] ?? 0;
		const next = Math.max(prev, this.prefixSumUpTo(phase) + weighted);
		this.perLibraryProgress[libraryKey] = next;
		return next;
	}

	average(): number {
		const values = Object.values(this.perLibraryProgress);
		if (values.length === 0) return 0;
		return values.reduce((a, b) => a + b, 0) / values.length;
	}

	private prefixSumUpTo(phase: Phase): number {
		const order: Phase[] = ['index', 'diff', 'merge', 'apply', 'hydrate', 'finalize'];
		let sum = 0;
		for (const p of order) {
			if (p === phase) break;
			sum += this.weights[p];
		}
		return sum;
	}
}

