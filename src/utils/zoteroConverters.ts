import type {
	Collection,
	Item,
	ZoteroCollectionResponse,
	ZoteroItemResponse,
} from '../types/zotero.api';

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
		rem: null,
		key: raw.key,
		version: raw.version,
		name: raw.name ?? '',
		parentCollection: raw.parentCollection || '',
		relations: raw.relations ?? {},
	};
}
