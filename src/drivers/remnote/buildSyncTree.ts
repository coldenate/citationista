import { filterAsync, type RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../../constants/constants';
import type { ZoteroCollection, ZoteroItem } from '../../types/types';
import { SyncTree } from '../../core/SyncTree';

/**
 * Build a SyncTree from the current RemNote KB.
 * Reads only power-up props; no writes.
 */
export async function buildSyncTreeFromRems(plugin: RNPlugin, libraryID: string): Promise<SyncTree> {
  const colPU = await plugin.powerup.getPowerupByCode(powerupCodes.COLLECTION);
  const itemPU = await plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);
  if (!colPU || !itemPU) throw new Error('Required power-ups missing');

  const [rawCols, rawItems] = await Promise.all([
    colPU.taggedRem().then((rs) => rs.filter((r) => !r.isPowerup())),
    itemPU.taggedRem().then((rs) => rs.filter((r) => !r.isPowerup())),
  ]);

  const libraryRems = await filterAsync(rawItems, async (r) => {
    const libraryKey = await r.getPowerupProperty(powerupCodes.ZOTERO_SYNCED_LIBRARY, 'key');
    return libraryKey === libraryID;
  });

  const libraryCols = await filterAsync(rawCols, async (r) => {
    const libraryKey = await r.getPowerupProperty(powerupCodes.ZOTERO_SYNCED_LIBRARY, 'key');
    return libraryKey === libraryID;
  });

  const collections: ZoteroCollection[] = [];
  for (const rem of libraryCols) {
    const blob = await rem.getPowerupProperty(powerupCodes.COLLECTION, 'fullData');
    if (!blob) continue;
    collections.push(JSON.parse(blob[0]) as ZoteroCollection);
  }

  const items: ZoteroItem[] = [];
  for (const rem of libraryRems) {
    const blob = await rem.getPowerupProperty(powerupCodes.ZITEM, 'fullData');
    if (!blob) continue;
    items.push(JSON.parse(blob[0]) as ZoteroItem);
  }

  return SyncTree.build({ collections, items });
}
