import type {
  ChangeSet,
  CreateOp,
  DeleteOp,
  MoveOp,
  RemOperation,
  UpdateOp,
} from '../types/types';
import type { SyncTreeNode } from './SyncTree';
import { resolveParentKey } from './parentUtils';

export function planRemOperations(changes: ChangeSet): RemOperation[] {
	const ops: RemOperation[] = [];

	/* ── 1) CREATIONS ───────────────────────────────────────────── */
        const queue: SyncTreeNode[] = [...changes.newCollections, ...changes.newItems];

        for (const n of queue) {
                const parentKey = resolveParentKey(n);

		ops.push({
			type: 'create',
			key: n.key,
			node: n,
			parentKey,
		} as CreateOp);
	}

	/* ── 2) UPDATES ─────────────────────────────────────────────── */
	for (const n of changes.updatedCollections) {
		ops.push({ type: 'update', key: n.key, node: n } as UpdateOp);
	}
	for (const n of changes.updatedItems) {
		ops.push({ type: 'update', key: n.key, node: n } as UpdateOp);
	}

	/* ── 3) MOVES ───────────────────────────────────────────────── */
        for (const n of [...changes.movedCollections, ...changes.movedItems]) {
                const newParentKey = resolveParentKey(n);
		ops.push({
			type: 'move',
			key: n.key,
			newParentKey,
		} as MoveOp);
	}

	/* ── 4) DELETIONS ───────────────────────────────────────────── */
	for (const n of changes.deletedItems) {
		ops.push({ type: 'delete', key: n.key, isCollection: false } as DeleteOp);
	}

	const sortedDeletedCols = [...changes.deletedCollections].sort(
		(a, b) => (a.children?.length ?? 0) - (b.children?.length ?? 0)
	);
	for (const n of sortedDeletedCols) {
		ops.push({ type: 'delete', key: n.key, isCollection: true } as DeleteOp);
	}

	return ops;
}
