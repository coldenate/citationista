import type { Rem, RNPlugin } from '@remnote/plugin-sdk';
import type { ZoteroCollection, ZoteroItem } from './zotero.api';

// Shared contracts for the modular sync pipeline

export type NodeKind = 'item' | 'collection' | 'note' | 'attachment';

// Global key prevents cross-library collisions: `${libraryKey}:${itemKey}`
export type GlobalKey = string;

export type SyncNode =
	| (BaseSyncNode & { kind: 'collection'; contents: ZoteroCollectionCore })
	| (BaseSyncNode & {
			kind: 'item' | 'note' | 'attachment';
			contents: ZoteroItemCore;
	  });

export interface BaseSyncNode {
	key: GlobalKey;
	libraryKey: string;
	itemKey: string;
	parentKeys: GlobalKey[];
}

// Strictly typed payloads derived from app types, without RemNote-side references or linkage pointers
export type ZoteroItemCore = Omit<ZoteroItem, 'rem' | 'children' | 'parent'>;
export type ZoteroCollectionCore = Omit<ZoteroCollection, 'rem' | 'children' | 'parent'>;

export interface LocalSidecar {
	remId: string;
	rem?: Rem | null;
	titleRT?: unknown; // Replace with RichText type if available
	propertyMap?: Record<string, unknown>;
	lastPluginWriteAt?: number;
	protectedUntil?: number;
}

export interface RemoteSidecar {
	etag?: string;
}

export type LocalNode = SyncNode & { sidecar: LocalSidecar };
export type RemoteNode = SyncNode & { sidecar: RemoteSidecar };
export type ShadowNode = SyncNode;

export interface IndexResult {
	nodeByKey: Map<GlobalKey, LocalNode>;
	childrenByParentKey: Map<GlobalKey, GlobalKey[]>;
	libraryRem: Rem | null;
	unfiledRem: Rem | null;
	libraryKey: string;
}

// Convenience re-exports for existing app types (avoid deep import churn now)
// Intentionally do not re-export app-level types here to avoid tight coupling.

/** Helpers */
export function makeGlobalKey(libraryKey: string, itemKey: string): GlobalKey {
	return `${libraryKey}:${itemKey}` as GlobalKey;
}

export type PluginLike = RNPlugin;

export type ChangeSet = {
	newItems: ZoteroItem[];
	updatedItems: ZoteroItem[];
	deletedItems: ZoteroItem[];
	movedItems: ZoteroItem[];
	newCollections: ZoteroCollection[];
	updatedCollections: ZoteroCollection[];
	deletedCollections: ZoteroCollection[];
	movedCollections: ZoteroCollection[];
};