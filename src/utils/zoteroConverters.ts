import type { Collection, Item } from '../types/types';

export function fromZoteroItem(raw: any) {
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

export function fromZoteroCollection(raw: any) {
	return {
		rem: null,
		key: raw.key,
		version: raw.version,
		name: raw.data?.name ?? '',
		parentCollection: raw.data?.parentCollection ?? '',
		relations: raw.relations ?? {},
	} as Collection;
}
