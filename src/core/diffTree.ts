import type { SyncTreeNode, ZoteroItem } from '../types/types';
import type { SyncTree } from './SyncTree';

export type Change =
	| { type: 'created'; node: SyncTreeNode; parentKey: string | null }
	| { type: 'deleted'; key: string }
	| {
			type: 'moved';
			key: string;
			oldParent: string | null;
			newParent: string | null;
	  }
	| { type: 'updated'; key: string; fields: (keyof ZoteroItem['data'])[] };

export function diffTrees(prev: SyncTree | null, next: SyncTree): Change[] {
	if (!prev)
		return next.toJSON().map((n) => ({
			type: 'created',
			node: n,
			parentKey: n.parent?.key ?? null,
		}));

	const changes: Change[] = [];
	const prevKeys = new Set(prev.toJSON().map((n) => n.key));
	const nextKeys = new Set(next.toJSON().map((n) => n.key));

	// created / deleted
	for (const k of nextKeys)
		if (!prevKeys.has(k)) {
			const node = next.get(k);
			if (node) {
				changes.push({
					type: 'created',
					node,
					parentKey: node.parent?.key ?? null,
				});
			}
		}
	for (const k of prevKeys) if (!nextKeys.has(k)) changes.push({ type: 'deleted', key: k });

	// moved / updated (naïve first pass)
	for (const k of nextKeys)
		if (prevKeys.has(k)) {
			const oldN = prev.get(k);
			const newN = next.get(k);
			if (!oldN || !newN) continue;
			if ((oldN.parent?.key ?? null) !== (newN.parent?.key ?? null))
				changes.push({
					type: 'moved',
					key: k,
					oldParent: oldN.parent?.key ?? null,
					newParent: newN.parent?.key ?? null,
				});
			if (
				JSON.stringify((oldN as ZoteroItem).data) !==
				JSON.stringify((newN as ZoteroItem).data)
			)
				changes.push({ type: 'updated', key: k, fields: ['title'] }); // stub
		}

	return changes;
}
