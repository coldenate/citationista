import type { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroAPI, type ZoteroLibraryInfo } from '../../api/zotero';
import { ensureSpecificLibraryRemExists, ensureUnfiledItemsRemExists, ensureZoteroLibraryRemExists } from '../../services/ensureUIPrettyZoteroRemExist';
import { planRemOperations } from '../../core/RemPlanner';
import { ChangeDetector } from '../../core/changeDetector';
import { SyncTree } from '../../core/SyncTree';
import type { ZoteroCollection, ZoteroItem } from '../../types/types';
import { RemExecutor } from './RemExecutor';
import { HydrationPipeline } from './HydrationPipeline';
import { startProgrammaticEdits } from '../../utils/editTracker';
import { LogType, logMessage } from '../../utils/logging';

/**
 * Sync a single Zotero library with the RemNote knowledge base.
 * Progress callback receives a 0-1 fraction for this library.
 */
export async function syncLibrary(
        plugin: RNPlugin,
        library: ZoteroLibraryInfo,
        onProgress: (fraction: number) => Promise<void> | void
): Promise<void> {
        const key = `${library.type}:${library.id}`;
        const api = new ZoteroAPI(plugin);

        try {
                await plugin.storage.setSynced('syncedLibraryId', key);
                await ensureZoteroLibraryRemExists(plugin);
                await ensureSpecificLibraryRemExists(plugin, library);
                await ensureUnfiledItemsRemExists(plugin, key);

                const currentZoteroData = await api.fetchLibraryContents(library.type, library.id);
                const localTree = await SyncTree.buildTreeFromRems(plugin, library.id);
                const remoteTree = SyncTree.build(currentZoteroData);

                const changeDetector = new ChangeDetector();
                const changes = changeDetector.diffTrees(localTree, remoteTree);
                if (!changes) return;

                const plan = planRemOperations(changes);
                startProgrammaticEdits();
                const executor = new RemExecutor(plugin);
                const touched = await executor.run(plan, (p) => onProgress(0.3 * p));

                const baseRaw = await plugin.storage.getSynced('beforeUserEdits');
                const baseTree = baseRaw
                        ? SyncTree.fromSerializable(baseRaw as {
                                  items: ZoteroItem[];
                                  collections: ZoteroCollection[];
                          })
                        : undefined;

                const hydrator = new HydrationPipeline(plugin);
                await hydrator.run(touched, baseTree, (f) => onProgress(0.3 + 0.6 * f));

                await plugin.storage.setSynced('beforeUserEdits', remoteTree.toSerializable());
                await plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
                await onProgress(1);
        } catch (error) {
                await logMessage(plugin, error as Error, LogType.Error, false);
        }
}
