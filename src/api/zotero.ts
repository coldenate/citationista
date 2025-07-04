// Rename summary: api -> createZoteroClient; connection -> zoteroConnection; getItems/getCollections/getAllData -> fetchItems/fetchCollections/fetchLibraryData
import type { RNPlugin } from '@remnote/plugin-sdk';
// @ts-ignore
import createZoteroClient from 'zotero-api-client';
import type {
	Collection,
	Item,
	ZoteroCollectionResponse,
	ZoteroItemResponse,
} from '../types/types';
import { fromZoteroCollection, fromZoteroItem } from '../utils/zoteroConverters';

/**
 * A class to interact with the Zotero API.
 * This class manages the connection to Zotero and provides methods to fetch items and collections.
 *
 * @class ZoteroAPI
 * @property {RNPlugin} plugin - The RemNote plugin instance
 * @property {any | null} connection - The Zotero API connection instance
 *
 * @throws {Error} Throws an error if Zotero API key or User ID is not set
 *
 * @example
 * ```typescript
 * const api = new ZoteroAPI(plugin);
 * const items = await api.fetchItems();
 * const collections = await api.fetchCollections();
 * ```
 * @example
 * ```typescript
 * const api = new ZoteroAPI(plugin);
 *	const { items, collections } = await api.fetchLibraryData();
 * ```
 */
export interface ZoteroLibraryInfo {
	id: string;
	name: string;
	type: 'user' | 'group';
}

export class ZoteroAPI {
	private plugin: RNPlugin;
	// biome-ignore lint/suspicious/noExplicitAny: how it was in the original code idk :?
	private zoteroConnection: any | null = null;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	// biome-ignore lint/suspicious/noExplicitAny: how it was in the original code idk :?
	private async getOrCreateConnection(
		libraryType?: 'user' | 'group',
		libraryId?: string
	): Promise<any> {
		if (this.zoteroConnection) return this.zoteroConnection;

		const apiKey = await this.plugin.settings.getSetting('zotero-api-key');
		if (!apiKey) {
			throw new Error('Zotero API key not set');
		}

		if (!libraryType || !libraryId) {
			const stored = await this.plugin.settings.getSetting('zotero-library-id');
			if (stored && typeof stored === 'string') {
				const [type, id] = stored.split(':');
				libraryType = (type as 'user' | 'group') || libraryType;
				libraryId = id || libraryId;
			}
		}

		if (!libraryType || !libraryId) {
			libraryType = 'user';
			libraryId = await this.plugin.settings.getSetting('zotero-user-id');
		}

		if (!libraryId) {
			throw new Error('Zotero Library ID not set');
		}

		this.zoteroConnection = await createZoteroClient(apiKey).library(libraryType, libraryId);
		return this.zoteroConnection;
	}

	private async fetchItems(): Promise<Item[]> {
		try {
			const apiConnection = await this.getOrCreateConnection();
			const items: Item[] = [];
			let start = 0;
			const limit = 100; // Maximize limit to reduce number of requests

			while (true) {
				const response = await apiConnection.items().get({ start, limit });
				const rawItems = response.raw as ZoteroItemResponse[];
				for (const raw of rawItems) {
					items.push(fromZoteroItem(raw));
				}

				if (rawItems.length < limit) {
					break; // All items have been fetched
				}

				// Update the start position for the next batch
				start += limit;
			}

			return items;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.plugin.app.toast(`Failed to fetch Zotero items: ${errorMessage}`);
			throw error;
		}
	}

	private async fetchCollections(): Promise<Collection[]> {
		try {
			const apiConnection = await this.getOrCreateConnection();
			const response = await apiConnection.collections().get();
			const rawCollections = response.getData() as ZoteroCollectionResponse[];
			return rawCollections.map(fromZoteroCollection);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.plugin.app.toast(`Failed to fetch Zotero collections: ${errorMessage}`);
			throw error;
		}
	}

	async fetchLibraryData(): Promise<{ items: Item[]; collections: Collection[] }> {
		const [items, collections] = await Promise.all([
			this.fetchItems(),
			this.fetchCollections(),
		]);
		console.log(
			`Fetched ${items.length} items and ${collections.length} collections from Zotero.`,
			items,
			collections
		);
		return { items, collections };
	}
}

export async function fetchLibraries(plugin: RNPlugin): Promise<ZoteroLibraryInfo[]> {
	const apiKey = await plugin.settings.getSetting('zotero-api-key');
	const userId = await plugin.settings.getSetting('zotero-user-id');

       if (!apiKey || !userId) {
               return [{ id: '', name: 'None', type: 'user' }];
       }

	const headers = { 'Zotero-API-Key': String(apiKey) };
	try {
		const res = await fetch(`https://api.zotero.org/users/${userId}/groups`, { headers });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const data = (await res.json()) as any[];
		const groups = data.map((g) => ({
			id: String(g.id ?? g.data?.id),
			name: g.data?.name ?? g.name ?? '',
			type: 'group' as const,
		}));
		return [{ id: String(userId), name: 'My Library', type: 'user' as const }, ...groups];
	} catch (err) {
		console.error('Failed to fetch group libraries', err);
		return [{ id: String(userId), name: 'My Library', type: 'user' }];
	}
}
