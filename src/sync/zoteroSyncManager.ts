// Rename summary: PropertyHydrator -> ZoteroPropertyHydrator; ensureZoteroRemExists -> ensureZoteroLibraryRemExists; getAllData -> fetchLibraryData
import type { RNPlugin } from '@remnote/plugin-sdk';

import { ZoteroAPI, fetchLibraries, type ZoteroLibraryInfo } from '../api/zotero';
import {
       ensureUnfiledItemsRemExists,
       ensureZoteroLibraryRemExists,
       ensureSpecificLibraryRemExists,

} from '../services/ensureUIPrettyZoteroRemExist';
import type { ChangeSet, Collection, Item } from '../types/types';
import { LogType, logMessage } from '../utils/logging';
import { ChangeDetector } from './changeDetector';
import { mergeUpdatedItems } from './mergeUpdatedItems';
import { ZoteroPropertyHydrator } from './propertyHydrator';
import { TreeBuilder } from './treeBuilder';
import { tryAcquire, release } from './syncLock';
import { checkAbortFlag } from '../services/pluginIO';

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

       private async updateProgress(value: number) {
               await this.plugin.storage.setSession('syncProgress', value);
       }

       private async setSyncingStatus(active: boolean) {
               await this.plugin.storage.setSession('syncing', active);
       }

       private async checkAbort(): Promise<boolean> {
               const stop = await checkAbortFlag(this.plugin);
               if (stop) {
                       await this.setSyncingStatus(false);
                       await this.updateProgress(0);
                       await this.plugin.storage.setSession('syncStartTime', undefined);
                       await logMessage(this.plugin, 'Sync aborted', LogType.Info, false);
               }
               return stop;
       }

       async sync(): Promise<void> {
               if (!tryAcquire()) {
                       await logMessage(
                               this.plugin,
                               'Sync already running; skipping new request.',
                               LogType.Info,
                               false
                       );
                       return;
               }
               try {
                       const multi = await this.plugin.settings.getSetting('sync-multiple-libraries');
                       if (multi) {
                       const libs = await fetchLibraries(this.plugin);
                       for (const lib of libs) {
                               await this.syncLibrary(lib);
                       }
                       await logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
                       return;
                       }

               const selected = (await this.plugin.settings.getSetting('zotero-library-id')) as
                       | string
                       | undefined;
               let library: ZoteroLibraryInfo | null = null;
               if (selected) {
                       const libs = await fetchLibraries(this.plugin);
                       library = libs.find((l) => `${l.type}:${l.id}` === selected) || null;
               } else {
                       const libs = await fetchLibraries(this.plugin);
                       if (libs.length > 0) {
                               library = libs[0];
                       }
               }
               if (!library) return;

               await this.syncLibrary(library);
               await logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
               } finally {
                       release();
               }
       }

       private async syncLibrary(library: ZoteroLibraryInfo): Promise<void> {
               const key = `${library.type}:${library.id}`;
               await this.plugin.storage.setSynced('syncedLibraryId', key);


               await ensureZoteroLibraryRemExists(this.plugin);
               await ensureSpecificLibraryRemExists(this.plugin, library);
               await ensureUnfiledItemsRemExists(this.plugin, key);

               await this.setSyncingStatus(true);
               await this.plugin.storage.setSession('syncStartTime', new Date().toISOString());
               await this.updateProgress(0);
               if (await this.checkAbort()) return;

               await this.updateProgress(0.1);
               if (await this.checkAbort()) return;

               // 2. Fetch current data from Zotero.
               const currentData = await this.api.fetchLibraryData(library.type, library.id);

		// 3. Retrieve previous sync data (shadow copy) from storage.
               const dataMap = (await this.plugin.storage.getSynced('zoteroDataMap')) as
                       | Record<
                                string,
                                {
                                        items?: Partial<Item>[];
                                        collections?: Partial<Collection>[];
                                }
                        >
                       | undefined;
               const prevDataRaw = dataMap?.[key];
               const prevData = {
                       items: (prevDataRaw?.items || []).map((i) => ({
                               rem: null,
                               ...i,
                       })) as Item[],
                       collections: (prevDataRaw?.collections || []).map((c) => ({
                               rem: null,
                               ...c,
                       })) as Collection[],
               };

		// 4. Initialize node cache for the current Rem tree.
               this.treeBuilder.setLibraryKey(key);
               await this.updateProgress(0.2);
               if (await this.checkAbort()) return;
               await this.treeBuilder.initializeNodeCache();



		// 5. Detect changes by comparing prevData and currentData.
               const changes: ChangeSet = this.changeDetector.detectChanges(prevData, currentData);
               // 6. For each updated item, merge local modifications with remote data,
               //    using the previous sync (shadow) data as the base.
               await mergeUpdatedItems(
                       this.plugin,
                       changes,
                       prevData.items,
                       this.treeBuilder.getNodeCache()
               );

               await this.updateProgress(0.4);
               if (await this.checkAbort()) return;

		// 7. Apply structural changes to update the Rem tree. (this step and beyond actually modify the user's KB.)
		console.log('Changes detected:', changes);
               await this.treeBuilder.applyChanges(changes);
               // 8. Populate detailed properties (build fields) on each Rem.
               const isSimpleSync = await this.plugin.settings.getSetting('simple-mode');
               if (!isSimpleSync) {
                       await this.propertyHydrator.hydrateItemAndCollectionProperties(changes);
               }

               await this.updateProgress(0.7);
               if (await this.checkAbort()) return;

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

               const updatedMap = {
                       ...(dataMap || {}),
                       [key]: serializableData,
               };
               await this.plugin.storage.setSynced('zoteroDataMap', updatedMap);

               await this.updateProgress(1);
               await this.plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
               await this.setSyncingStatus(false);
               await this.plugin.storage.setSession('syncStartTime', undefined);
               await logMessage(this.plugin, 'Library sync complete', LogType.Info, false);
       }
}
