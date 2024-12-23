import { RNPlugin } from '@remnote/plugin-sdk';
// @ts-ignore
import api from 'zotero-api-client';
import { Collection, Item } from '../types/types';

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
 * const items = await api.getItems();
 * const collections = await api.getCollections();
 * ```
 * @example
 * ```typescript
 * const api = new ZoteroAPI(plugin);
 *	const { items, collections } = await api.getAllData();
 * ```
 */
export class ZoteroAPI {
	private plugin: RNPlugin;
	private connection: any | null = null;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	private async ensureConnection(): Promise<any> {
		if (this.connection) return this.connection;

		const apiKey = await this.plugin.settings.getSetting('zotero-api-key');
		const userId = await this.plugin.settings.getSetting('zotero-user-id');

		if (!apiKey) {
			throw new Error('Zotero API key not set');
		}
		if (!userId) {
			throw new Error('Zotero User ID not set');
		}

		this.connection = await api(apiKey).library('user', userId);
		return this.connection;
	}

	private async getItems(): Promise<Item[]> {
		try {
			const conn = await this.ensureConnection();
			const items: Item[] = [];
			let start = 0;
			const limit = 100; // Maximize limit to reduce number of requests

			while (true) {
				const response = await conn.items().get({ start, limit });
				items.push(...response.raw);

				if (response.raw.length < limit) {
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

	private async getCollections(): Promise<Collection[]> {
		try {
			const conn = await this.ensureConnection();
			const response = await conn.collections().get();
			return response.getData();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.plugin.app.toast(`Failed to fetch Zotero collections: ${errorMessage}`);
			throw error;
		}
	}

	async getAllData(): Promise<{ items: Item[]; collections: Collection[] }> {
		const [items, collections] = await Promise.all([this.getItems(), this.getCollections()]);
		return { items, collections };
	}
}
