import { RNPlugin } from '@remnote/plugin-sdk';
// @ts-ignore
import { ZoteroAPI } from '../api/zotero';
import { TreeBuilder } from './treeBuilder';
import { ChangeDetector } from './changeDetector';
import { PropertyHydrator } from './propertyHydrator';
import { ChangeSet, Collection, Item } from '../types/types';
import { birthZoteroRem, ensureUnfiledItemsRem } from '../services/createLibraryRem';
import { logMessage, LogType } from '../utils/logging';

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
		const rem = await birthZoteroRem(this.plugin);
		await ensureUnfiledItemsRem(this.plugin);

		const isSimpleSync = await this.plugin.settings.getSetting('simple-mode');
		// Fetch current data from Zotero
		const currentData = await this.api.getAllData();

		// Retrieve previous data from storage
		let prevData = ((await this.plugin.storage.getSynced('zoteroData')) as {
			items: Item[];
			collections: Collection[];
		}) || {
			items: [],
			collections: [],
		};

		// Check if previous data exists
		if (!prevData.items || !prevData.collections) {
			prevData = { items: [], collections: [] };
		}

		// **Initialize nodeCache**
		await this.treeBuilder.initializeNodeCache();

		// Detect changes
		const changes: ChangeSet = this.changeDetector.detectChanges(prevData, currentData); // this does not use the nodeCache

		// Apply changes to the RemNote tree
		await this.treeBuilder.applyChanges(changes);

		// Hydrate properties of affected Rems
		if (!isSimpleSync) await this.propertyHydrator.hydrateProperties(changes);

		const serializableCurrentData = {
			items: currentData.items.map((item) => {
				const { rem, ...serializableItem } = item;
				return serializableItem;
			}),
			collections: currentData.collections.map((collection) => {
				const { rem, ...serializableCollection } = collection;
				return serializableCollection;
			}),
		};

		// Store current data for future comparisons
		await this.plugin.storage.setSynced('zoteroData', serializableCurrentData);
		logMessage(this.plugin, '🔁 Synced with Zotero!', LogType.Info, true);
	}
}
