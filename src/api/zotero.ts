/** Utility wrappers around the Zotero REST API. */
/** biome-ignore-all lint/suspicious/noExplicitAny: <-- this is how it was in the original code --> */
import type { RNPlugin } from '@remnote/plugin-sdk';
// @ts-ignore
import createZoteroClient from 'zotero-api-client';
import type {
       Collection,
       Item,
       ZoteroCollectionResponse,
       ZoteroItemResponse,
       ZoteroGroupListItem,
       ZoteroUserResponse,
} from '../types/types';
import { LogType, logMessage } from '../utils/logging';
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
	private zoteroConnection: any | null = null;
	private lastLibraryKey: string | null = null;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	private async getOrCreateConnection(
		libraryType?: 'user' | 'group',
		libraryId?: string
	): Promise<any> {
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

		const key = `${libraryType}:${libraryId}`;
		if (this.zoteroConnection && this.lastLibraryKey === key) {
			return this.zoteroConnection;
		}

		this.zoteroConnection = await createZoteroClient(apiKey).library(libraryType, libraryId);
		this.lastLibraryKey = key;
		return this.zoteroConnection;
	}

	private async fetchItems(libraryType?: 'user' | 'group', libraryId?: string): Promise<Item[]> {
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
		libraryType?: 'user' | 'group',
		libraryId?: string
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
		libraryType?: 'user' | 'group',
		libraryId?: string
	): Promise<{ items: Item[]; collections: Collection[] }> {
		const [items, collections] = await Promise.all([
			this.fetchItems(libraryType, libraryId),
			this.fetchCollections(libraryType, libraryId),
		]);
		await logMessage(
			this.plugin,
			`Fetched ${items.length} items and ${collections.length} collections from Zotero.`,
			LogType.Debug,
			false
		);
		return { items, collections };
	}
}

export async function fetchLibraries(plugin: RNPlugin): Promise<ZoteroLibraryInfo[]> {
	const apiKey = await plugin.settings.getSetting('zotero-api-key');
	const userId = await plugin.settings.getSetting('zotero-user-id');

	if (!apiKey || !userId) {
		return [];
	}

	const headers = { 'Zotero-API-Key': String(apiKey) };

	// Use proxy in development mode to avoid CORS issues
	const baseUrl = process.env.NODE_ENV === 'development' ? '/zotero' : 'https://api.zotero.org';

	try {
                const resUser = await fetch(`${baseUrl}/users/${userId}`, { headers });

                let userName = 'My Library';
                if (resUser.ok) {
                        const userData = (await resUser.json()) as ZoteroUserResponse;
                        userName =
                                userData.data?.profileName ||
                                userData.data?.username ||
                                userName;
                }

                const res = await fetch(`${baseUrl}/users/${userId}/groups`, { headers });

                if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                }
                const data = (await res.json()) as ZoteroGroupListItem[];
                const groups = data.map((g) => ({
                        id: String(g.id ?? g.data?.id),
                        name: g.data?.name ?? g.name ?? '',
                        type: 'group' as const,
                }));
		return [{ id: String(userId), name: userName, type: 'user' as const }, ...groups];
        } catch (err) {
                await logMessage(
                        plugin,
                        'Failed to fetch group libraries',
                        LogType.Error,
                        false,
                        String(err)
                );

		await plugin.app.toast(
			'Failed to fetch group libraries. Your browser may be blocking the request.'
		);
                return [{ id: String(userId), name: 'My Library', type: 'user' }];
        }
}

/**
 * Update an existing Zotero note item.
 * @param plugin - The RemNote plugin instance.
 * @param itemKey - Zotero key of the note item to update.
 * @param noteHTML - HTML content for the note.
 * @param version - Last known Zotero version of the item.
 */
export async function updateNote(
        plugin: RNPlugin,
        itemKey: string,
        noteHTML: string,
        version: number
): Promise<void> {
        const apiKey = await plugin.settings.getSetting('zotero-api-key');
        const userId = await plugin.settings.getSetting('zotero-user-id');
        const libSetting = await plugin.settings.getSetting('zotero-library-id');

        if (!apiKey || !userId) {
                throw new Error('Zotero credentials not set');
        }

        let libraryId = String(userId);
        let libraryType: 'users' | 'groups' = 'users';
        if (typeof libSetting === 'string' && libSetting.includes(':')) {
                const [type, id] = libSetting.split(':');
                libraryType = type === 'group' ? 'groups' : 'users';
                libraryId = id;
        }

        const baseUrl = process.env.NODE_ENV === 'development' ? '/zotero' : 'https://api.zotero.org';
        const res = await fetch(`${baseUrl}/${libraryType}/${libraryId}/items/${itemKey}`, {
                method: 'PATCH',
                headers: {
                        'Content-Type': 'application/json',
                        'Zotero-API-Key': String(apiKey),
                        'Zotero-API-Version': '3',
                        'If-Unmodified-Since-Version': String(version),
                },
                body: JSON.stringify({ note: noteHTML }),
        });

        if (!res.ok) {
                const body = await res.text();
                throw new Error(`Failed to update note ${itemKey}: ${res.status} ${body}`);
        }
}
