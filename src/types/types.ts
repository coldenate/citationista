import { Rem } from '@remnote/plugin-sdk';

export type Item = {
	version: number;
	message: string;
	key: string;
	rem: Rem;
	data: any; //TODO: make this more specific later
};

export type Collection = {
	rem: Rem;
	key: string;
	version: number;
	name: string;
	parentCollectionID: string;
	relations: Record<string, string>; // TODO: Implement Relations (if needed?)
};
