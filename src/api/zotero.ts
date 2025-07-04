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
export class ZoteroAPI {
	private plugin: RNPlugin;
	// biome-ignore lint/suspicious/noExplicitAny: how it was in the original code idk :?
	private zoteroConnection: any | null = null;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	async fetchGroupLibraries(): Promise<{ id: string; name: string }[]> {
		const apiKey = await this.plugin.settings.getSetting('zotero-api-key');
		const userId = await this.plugin.settings.getSetting('zotero-user-id');

		if (!apiKey || !userId) {
			throw new Error('Zotero credentials not set');
		}

		try {
			const response = await createZoteroClient(apiKey)
				.library('user', userId)
				.groups()
				.get();
			const groups = response.getData() as any[];
			return groups.map((g) => ({
				id: String(g.id ?? g.data?.id ?? g.groupID ?? g.data?.groupID ?? ''),
				name: String(g.name ?? g.data?.name ?? ''),
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.plugin.app.toast(`Failed to fetch Zotero groups: ${errorMessage}`);
			return [];
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: how it was in the original code idk :?
	private async getOrCreateConnection(
		libraryType: 'user' | 'group',
		libraryId: string
	): Promise<any> {
		if (this.zoteroConnection) return this.zoteroConnection;

		const apiKey = await this.plugin.settings.getSetting('zotero-api-key');

		if (!apiKey) {
			throw new Error('Zotero API key not set');
		}
		if (!libraryId) {
			throw new Error('Zotero Library ID not set');
		}

		this.zoteroConnection = await createZoteroClient(apiKey).library(libraryType, libraryId);
		return this.zoteroConnection;
	}

	private async fetchItems(libraryType: 'user' | 'group', libraryId: string): Promise<Item[]> {
		try {
			const apiConnection = await this.getOrCreateConnection(libraryType, libraryId);
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

	private async fetchCollections(
		libraryType: 'user' | 'group',
		libraryId: string
	): Promise<Collection[]> {
		try {
			const apiConnection = await this.getOrCreateConnection(libraryType, libraryId);
			const response = await apiConnection.collections().get();
			const rawCollections = response.getData() as ZoteroCollectionResponse[];
			return rawCollections.map(fromZoteroCollection);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.plugin.app.toast(`Failed to fetch Zotero collections: ${errorMessage}`);
			throw error;
		}
	}

	async fetchLibraryData(
		libraryType: 'user' | 'group',
		libraryId: string
	): Promise<{ items: Item[]; collections: Collection[] }> {
		const [items, collections] = await Promise.all([
			this.fetchItems(libraryType, libraryId),
			this.fetchCollections(libraryType, libraryId),
		]);
		console.log(
			`Fetched ${items.length} items and ${collections.length} collections from Zotero.`,
			items,
			collections
		);
		return { items, collections };
	}
}
