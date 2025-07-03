import type { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroSyncManager } from '../sync/zoteroSyncManager';

export async function autoSync(plugin: RNPlugin) {
	const isDisabled = await plugin.settings.getSetting('disable-auto-sync');
	if (isDisabled) {
		return;
	}
	const manager = new ZoteroSyncManager(plugin);
	await manager.sync();
}
