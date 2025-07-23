export interface SyncNode {
	key: string;
	type: 'collection' | 'item' | 'note';
	title: string;
	parentKey?: string;
	children: SyncNode[];
	raw?: unknown;
}

export interface SyncTree {
	rootCollections: SyncNode[];
	orphans: SyncNode[];
	lookup: Record<string, SyncNode>;
}

export type SyncOp = {
	op: 'create' | 'update' | 'move' | 'delete';
	node?: SyncNode;
	key?: string;
	newParentKey?: string;
};

export function isCollectionNode(node: SyncNode): node is SyncNode & { type: 'collection' } {
	return node.type === 'collection';
}

export function isItemNode(node: SyncNode): node is SyncNode & { type: 'item' } {
	return node.type === 'item';
}

export function isNoteNode(node: SyncNode): node is SyncNode & { type: 'note' } {
	return node.type === 'note';
}
