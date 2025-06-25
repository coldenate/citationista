import type {
	Collection,
	Item,
	ZoteroCollectionResponse,
	ZoteroItemResponse,
} from '../types/types';

export function fromZoteroItem(raw: ZoteroItemResponse): Item {
	return {
		key: raw.key,
		version: raw.version,
		message: raw.message,
		rem: null,
		data: {
			key: raw.key,
			version: raw.version,
			...raw.data,
		},
	} as Item;
}

export function fromZoteroCollection(raw: ZoteroCollectionResponse): Collection {
	return {
		rem: raw.rem ?? null,
		key: raw.key,
		version: raw.version,
		name: raw.name ?? '',
		parentCollection: typeof raw.parentCollection === 'string' ? raw.parentCollection : '',
		relations: raw.relations ?? {},
	} as Collection;
}
