// Rename summary: PropertyHydrator -> ZoteroPropertyHydrator; ensureZoteroRemExists -> ensureZoteroLibraryRemExists; getAllData -> fetchLibraryData
import type { RNPlugin } from '@remnote/plugin-sdk';

import { fetchLibraries, ZoteroAPI, type ZoteroLibraryInfo } from '../api/zotero';
import {
	ensureSpecificLibraryRemExists,
	ensureUnfiledItemsRemExists,
	ensureZoteroLibraryRemExists,
} from '../services/ensureUIPrettyZoteroRemExist';
import { checkAbortFlag } from '../services/pluginIO';
import type { ChangeSet, Collection, Item } from '../types/types';
import { LogType, logMessage } from '../utils/logging';
import { ChangeDetector } from './changeDetector';
import { mergeUpdatedItems } from './mergeUpdatedItems';
import { ZoteroPropertyHydrator } from './propertyHydrator';
import { release, tryAcquire } from './syncLock';
import { TreeBuilder } from './treeBuilder';

export class ZoteroSyncManager {
        private plugin: RNPlugin;
        private api: ZoteroAPI;
        private treeBuilder: TreeBuilder;
        private changeDetector: ChangeDetector;
        private propertyHydrator: ZoteroPropertyHydrator;
        /** Map tracking progress for each library during a multi-library sync */
        private multiLibraryProgress: Record<string, number> | null = null;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
		this.api = new ZoteroAPI(plugin);
		this.treeBuilder = new TreeBuilder(plugin);
		this.changeDetector = new ChangeDetector();
		this.propertyHydrator = new ZoteroPropertyHydrator(plugin);
	}

        private async updateProgress(value: number, libraryKey?: string) {
                // When multi-library progress tracking is active, update the
                // per-library progress map and derive an aggregated progress
                if (this.multiLibraryProgress && libraryKey) {
                        const prev = this.multiLibraryProgress[libraryKey] ?? 0;
                        // Ensure progress never moves backwards
                        const next = value < prev ? prev : value;
                        this.multiLibraryProgress[libraryKey] = next;
                        await this.plugin.storage.setSession(
                                'multiLibraryProgress',
                                { ...this.multiLibraryProgress }
                        );
                        const total = Object.values(this.multiLibraryProgress).reduce(
                                (a, b) => a + b,
                                0
                        );
                        const avg = total / Object.keys(this.multiLibraryProgress).length;
                        await this.plugin.storage.setSession('syncProgress', avg);
                        return;
                }

                // Fallback for single-library syncs
                await this.plugin.storage.setSession('syncProgress', value);
        }

	private async setSyncingStatus(active: boolean) {
		await this.plugin.storage.setSession('syncing', active);
	}

        private async checkAbort(isMulti: boolean): Promise<boolean> {
                const stop = await checkAbortFlag(this.plugin);
                if (stop) {
                        await this.setSyncingStatus(false);
                        await this.updateProgress(0);
                        await this.plugin.storage.setSession('syncStartTime', undefined);
                        if (isMulti) {
                                this.multiLibraryProgress = null;
                                await this.plugin.storage.setSession('multiLibraryProgress', undefined);
                        }
                        await logMessage(this.plugin, 'Sync aborted', LogType.Info, false);
                }
                return stop;
        }

        async sync(): Promise<void> {
                const existing = await this.plugin.storage.getSession('syncing');
                if (existing) {
                        await logMessage(
                                this.plugin,
                                'Incomplete previous sync detected. Cleaning up.',
                                LogType.Warning,
                                false
                        );
                        await this.setSyncingStatus(false);
                }
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
                                this.multiLibraryProgress = {};
                                for (const lib of libs) {
                                        this.multiLibraryProgress[`${lib.type}:${lib.id}`] = 0;
                                }
                                await this.plugin.storage.setSession('multiLibraryProgress', { ...this.multiLibraryProgress });
                                await this.setSyncingStatus(true);
                                await this.plugin.storage.setSession('syncStartTime', new Date().toISOString());
                                await this.updateProgress(0);
                                for (const lib of libs) {
                                        await this.syncLibrary(lib, true);
                                }
                                await logMessage(this.plugin, 'Sync complete!', LogType.Info, true);
                                this.multiLibraryProgress = null;
                                await this.plugin.storage.setSession('multiLibraryProgress', undefined);
                                await this.setSyncingStatus(false);
                                await this.updateProgress(0);
                                await this.plugin.storage.setSession('syncStartTime', undefined);
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

        private async syncLibrary(library: ZoteroLibraryInfo, isMulti: boolean = false): Promise<void> {
                const key = `${library.type}:${library.id}`;
                await this.plugin.storage.setSynced('syncedLibraryId', key);

                if (!isMulti) {
                        await this.setSyncingStatus(true);
                        await this.plugin.storage.setSession('syncStartTime', new Date().toISOString());
                }
                await this.updateProgress(0, key);

                try {
                        await ensureZoteroLibraryRemExists(this.plugin);
                        await ensureSpecificLibraryRemExists(this.plugin, library);
                        await ensureUnfiledItemsRemExists(this.plugin, key);

                        if (await this.checkAbort(isMulti)) return;

                        await this.updateProgress(0.1, key);
                        if (await this.checkAbort(isMulti)) return;

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
                        await this.updateProgress(0.2, key);
                        if (await this.checkAbort(isMulti)) return;
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

                        await this.updateProgress(0.4, key);
                        if (await this.checkAbort(isMulti)) return;

                // 7. Apply structural changes to update the Rem tree. (this step and beyond actually modify the user's KB.)
                        await logMessage(this.plugin, 'Applying tree changes', LogType.Debug, false);
                        await logMessage(this.plugin, JSON.stringify(changes), LogType.Debug, false);
                        const applyTotal =
                                changes.newItems.length +
                                changes.updatedItems.length +
                                changes.deletedItems.length +
                                changes.movedItems.length +
                                changes.newCollections.length +
                                changes.updatedCollections.length +
                                changes.deletedCollections.length +
                                changes.movedCollections.length;
                        let applied = 0;
                        const applyProgress = async () => {
                                applied++;
                                await this.updateProgress(0.4 + (applied / Math.max(applyTotal, 1)) * 0.3, key);
                        };
                        await this.treeBuilder.applyChanges(changes, applyProgress);
		// 8. Populate detailed properties (build fields) on each Rem.
                        const isSimpleSync = await this.plugin.settings.getSetting('simple-mode');
                        const hydrateTotal =
                                changes.newItems.length +
                                changes.updatedItems.length +
                                changes.newCollections.length +
                                changes.updatedCollections.length;
                        let hydrated = 0;
                        const hydrateProgress = async () => {
                                hydrated++;
                                await this.updateProgress(0.7 + (hydrated / Math.max(hydrateTotal, 1)) * 0.2, key);
                        };
                        if (!isSimpleSync) {
                                await this.propertyHydrator.hydrateItemAndCollectionProperties(
                                        changes,
                                        hydrateProgress
                                );
                        } else {
                                await this.updateProgress(0.9, key);
                        }
                        if (await this.checkAbort(isMulti)) return;

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

                        await this.updateProgress(1, key);
                        await this.plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
                        await logMessage(this.plugin, 'Library sync complete', LogType.Info, false);

                } catch (error) {
                        await logMessage(this.plugin, error as Error, LogType.Error, false);
                } finally {
                        if (!isMulti) {
                                await this.setSyncingStatus(false);
                                await this.updateProgress(0, key);
                                await this.plugin.storage.setSession('syncStartTime', undefined);
                        } else {
                                // ensure final progress is recorded as complete
                                await this.updateProgress(1, key);
                        }
                }
        }
}
