import { Rem } from '@remnote/plugin-sdk';

export type Item = {
	version: number;
	message: string;
	key: string;
	rem: Rem;
	data: any; //TODO: make this more specific later
};

export interface ChangeSet {
	newItems: Item[];
	updatedItems: Item[];
	deletedItems: Item[];
	movedItems: Item[];
	newCollections: Collection[];
	updatedCollections: Collection[];
	deletedCollections: Collection[];
	movedCollections: Collection[];
}

export type Collection = {
	rem: Rem;
	key: string;
	version: number;
	name: string;
	parentCollection: string;
	relations: Record<string, string>; // TODO: Implement Relations (if needed?)
};

export interface RemNode {
	remId: string;
	zoteroId: string;
	zoteroParentId: string | string[] | null;
	rem: Rem;
}
