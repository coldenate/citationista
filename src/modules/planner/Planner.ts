import type { GlobalKey } from '../../types/syncContracts';

export type PlannedOpType =
	| 'createCollection'
	| 'createItem'
	| 'updateFields'
	| 'attachToParent'
	| 'detachFromParent'
	| 'reparentCollection'
	| 'deleteItem'
	| 'deleteCollection'
	| 'portal'
	| 'reference';

export interface PlannedOp {
	id: string;
	type: PlannedOpType;
	libraryKey: string;
	entityKey: GlobalKey;
	parentKey?: GlobalKey;
	fields?: Record<string, unknown>;
}

export interface PlanResult {
	ops: PlannedOp[];
	countsByType: Record<PlannedOpType, number>;
}

export function planChangeSet(libraryKey: string, _changes: unknown): PlanResult {
	// Minimal scaffold: produce a stable, empty plan for now.
	const ops: PlannedOp[] = [];
	const countsByType = {
		createCollection: 0,
		createItem: 0,
		updateFields: 0,
		attachToParent: 0,
		detachFromParent: 0,
		reparentCollection: 0,
		deleteItem: 0,
		deleteCollection: 0,
		portal: 0,
		reference: 0,
	} as Record<PlannedOpType, number>;
	return { ops, countsByType };
}
