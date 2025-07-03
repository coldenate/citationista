// Rename summary: PropertyHydrator -> ZoteroPropertyHydrator; ensureZoteroRemExists -> ensureZoteroLibraryRemExists; getAllData -> fetchLibraryData
import type { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroAPI } from '../api/zotero';
import {
	ensureUnfiledItemsRemExists,
	ensureZoteroLibraryRemExists,
} from '../services/ensureUIPrettyZoteroRemExist';
import { createSyncAbortController, checkAbortSignal } from '../services/pluginIO';
import type { ChangeSet, Collection, Item } from '../types/types';
import { LogType, logMessage } from '../utils/logging';
import { ChangeDetector } from './changeDetector';
import { mergeUpdatedItems } from './mergeUpdatedItems';
import { ZoteroPropertyHydrator } from './propertyHydrator';
import { TreeBuilder } from './treeBuilder';

export class ZoteroSyncManager {
	private plugin: RNPlugin;
	private api: ZoteroAPI;
	private treeBuilder: TreeBuilder;
	private changeDetector: ChangeDetector;
	private propertyHydrator: ZoteroPropertyHydrator;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
		this.api = new ZoteroAPI(plugin);
		this.treeBuilder = new TreeBuilder(plugin);
		this.changeDetector = new ChangeDetector();
		this.propertyHydrator = new ZoteroPropertyHydrator(plugin);
	}

	async sync(): Promise<void> {
		// Create abort controller for clean cancellation handling
		const abortController = await createSyncAbortController(this.plugin);
		const signal = abortController.signal;
		
		try {
			// 1. Ensure essential Rems exist (e.g., Zotero Library Rem, Unfiled Items Rem).
			await ensureZoteroLibraryRemExists(this.plugin);
			await ensureUnfiledItemsRemExists(this.plugin);
			await checkAbortSignal(this.plugin, signal);

			// 2. Fetch current data from Zotero.
			const currentData = await this.api.fetchLibraryData();
			await checkAbortSignal(this.plugin, signal);

			// 3. Retrieve previous sync data (shadow copy) from storage.
			const prevDataRaw = (await this.plugin.storage.getSynced('zoteroData')) as
				| {
						items?: Partial<Item>[];
						collections?: Partial<Collection>[];
				  }
				| undefined;
			const prevData = {
				items: (prevDataRaw?.items || []).map((i) => ({
					rem: null,
					// spread to capture stored fields
					...i,
				})) as Item[],
				collections: (prevDataRaw?.collections || []).map((c) => ({
					rem: null,
					...c,
				})) as Collection[],
			};

			// 4. Initialize node cache for the current Rem tree.
			await this.treeBuilder.initializeNodeCache();
			await checkAbortSignal(this.plugin, signal);

			// 5. Detect changes by comparing prevData and currentData.
			const changes: ChangeSet = this.changeDetector.detectChanges(prevData, currentData);
			await checkAbortSignal(this.plugin, signal);

			// 6. For each updated item, merge local modifications with remote data,
			//    using the previous sync (shadow) data as the base.
			await mergeUpdatedItems(
				this.plugin,
				changes,
				prevData.items,
				this.treeBuilder.getNodeCache(),
				signal
			);

			// 7. Apply structural changes to update the Rem tree. (this step and beyond actually modify the user's KB.)
			console.log('Changes detected:', changes);
			await this.treeBuilder.applyChanges(changes, signal);
			
			// 8. Populate detailed properties (build fields) on each Rem.
			const isSimpleSync = await this.plugin.settings.getSetting('simple-mode');
			if (!isSimpleSync) {
				await this.propertyHydrator.hydrateItemAndCollectionProperties(changes);
			}
			await checkAbortSignal(this.plugin, signal);

			// 9. Save the current data as the new shadow copy for future syncs.
			const serializableData = {
				items: currentData.items.map((item) => {
					const { rem: _rem, ...rest } = item;
					return rest;
				}),
				collections: currentData.collections.map((collection) => {
					const { rem: _rem, ...rest } = collection;
					return rest;
				}),
			};
			await this.plugin.storage.setSynced('zoteroData', serializableData);

			logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				// Sync was cancelled - this is expected behavior
				return;
			}
			// Re-throw other errors
			throw error;
		}
	}
}
