import { SyncNode } from '../models/interfaces';

export function depth(node: SyncNode & { parent?: SyncNode; _depth?: number }): number {
	if (node._depth !== undefined) return node._depth;
	const d = node.parent ? depth(node.parent) + 1 : 0;
	node._depth = d;
	return d;
}
