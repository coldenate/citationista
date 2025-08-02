import type { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroSyncManager } from '../drivers/remnote/zoteroSyncManager';

/** Kick off a sync cycle if auto‑sync is enabled. */

export async function autoSync(plugin: RNPlugin) {
	const isDisabled = await plugin.settings.getSetting('disable-auto-sync');
	if (isDisabled) {
		return;
	}
	const manager = new ZoteroSyncManager(plugin);
	await manager.sync();
}
