import { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroAPI } from '../api/zotero';
import { TreeBuilder } from './treeBuilder';
import { ChangeDetector } from './changeDetector';
import { PropertyHydrator } from './propertyHydrator';
import { ChangeSet, Item, Collection } from '../types/types';
import { logMessage, LogType } from '../utils/logging';
import {
	ensureUnfiledItemsRem,
	ensureZoteroRemExists,
} from '../services/ensureUIPrettyZoteroRemExist';
import { mergeUpdatedItems } from './mergeUpdatedItems';

export class ZoteroSyncManager {
	private plugin: RNPlugin;
	private api: ZoteroAPI;
	private treeBuilder: TreeBuilder;
	private changeDetector: ChangeDetector;
	private propertyHydrator: PropertyHydrator;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
		this.api = new ZoteroAPI(plugin);
		this.treeBuilder = new TreeBuilder(plugin);
		this.changeDetector = new ChangeDetector();
		this.propertyHydrator = new PropertyHydrator(plugin);
	}

	async sync(): Promise<void> {
		// 1. Ensure essential Rems exist (e.g., Zotero Library Rem, Unfiled Items Rem).
		await ensureZoteroRemExists(this.plugin);
		await ensureUnfiledItemsRem(this.plugin);

		// 2. Fetch current data from Zotero.
		const currentData = await this.api.getAllData();

		// 3. Retrieve previous sync data (shadow copy) from storage.
		let prevData = ((await this.plugin.storage.getSynced('zoteroData')) as {
			items: Item[];
			collections: Collection[];
		}) || { items: [], collections: [] };

		// 4. Initialize node cache for the current Rem tree.
		await this.treeBuilder.initializeNodeCache();

		// 5. Detect changes by comparing prevData and currentData.
		const changes: ChangeSet = this.changeDetector.detectChanges(prevData, currentData);
		// 6. For each updated item, merge local modifications with remote data,
		//    using the previous sync (shadow) data as the base.
		await mergeUpdatedItems(this.plugin, changes, prevData.items);

		// 7. Apply structural changes to update the Rem tree. (this step and beyond actually modify the user's KB.) 
		console.log('Changes detected:', changes);
		await this.treeBuilder.applyChanges(changes);
		// 8. Populate detailed properties (build fields) on each Rem.
		const isSimpleSync = await this.plugin.settings.getSetting('simple-mode');
		if (!isSimpleSync) {
			await this.propertyHydrator.hydrateProperties(changes);
		}

		// 9. Save the current data as the new shadow copy for future syncs.
		const serializableData = {
			items: currentData.items.map((item) => {
				const { rem, ...rest } = item;
				return rest;
			}),
			collections: currentData.collections.map((collection) => {
				const { rem, ...rest } = collection;
				return rest;
			}),
		};
		await this.plugin.storage.setSynced('zoteroData', serializableData);

		logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
	}
}
