import type { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroAPI, type ZoteroLibraryInfo } from '../../api/zotero';
import { ensureSpecificLibraryRemExists, ensureUnfiledItemsRemExists, ensureZoteroLibraryRemExists } from '../../services/ensureUIPrettyZoteroRemExist';
import { checkAbortFlag } from '../../services/pluginIO';
import { ChangeDetector } from '../../core/changeDetector';
import { planRemOperations } from '../../core/RemPlanner';
import { SyncTree } from '../../core/SyncTree';
import { buildSyncTreeFromRems } from './buildSyncTree';
import { RemExecutor } from './RemExecutor';
import { HydrationPipeline } from './HydrationPipeline';
import type { ZoteroCollection, ZoteroItem } from '../../types/types';
import { LogType, logMessage } from '../../utils/logging';
import { startProgrammaticEdits } from '../../utils/editTracker';

/**
 * Sync a single Zotero library into the current RemNote KB.
 */
export async function syncLibrary(
  plugin: RNPlugin,
  library: ZoteroLibraryInfo,
  onProgress: (fraction: number) => Promise<void>
): Promise<void> {
  const api = new ZoteroAPI(plugin);
  await plugin.storage.setSynced('syncedLibraryId', `${library.type}:${library.id}`);

  try {
    await ensureZoteroLibraryRemExists(plugin);
    await ensureSpecificLibraryRemExists(plugin, library);
    await ensureUnfiledItemsRemExists(plugin, `${library.type}:${library.id}`);

    if (await checkAbortFlag(plugin)) return;
    await onProgress(0.1);

    const currentZoteroData = await api.fetchLibraryContents(library.type, library.id);
    const localTree = await buildSyncTreeFromRems(plugin, library.id);
    const remoteTree = SyncTree.build(currentZoteroData);

    const changes = new ChangeDetector().diffTrees(localTree, remoteTree);
    const plan = planRemOperations(changes);

    startProgrammaticEdits();
    const executor = new RemExecutor(plugin);
    const touched = await executor.run(plan, (p) => onProgress(0.3 * p));

    const baseRaw = await plugin.storage.getSynced('beforeUserEdits');
    const baseTree = baseRaw
      ? SyncTree.fromSerializable(baseRaw as { items: ZoteroItem[]; collections: ZoteroCollection[] })
      : undefined;

    const hydrator = new HydrationPipeline(plugin);
    await hydrator.run(touched, baseTree, async (f) => onProgress(0.3 + 0.6 * f));

    await plugin.storage.setSynced('beforeUserEdits', remoteTree.toSerializable());
    await plugin.storage.setSynced('lastSyncTime', new Date().toISOString());
    await onProgress(1);
    await logMessage(plugin, 'Library sync complete', LogType.Info, false);
  } catch (err) {
    await logMessage(plugin, err as Error, LogType.Error, false);
    throw err;
  }
}
