import { RNPlugin } from '@remnote/plugin-sdk';
import api from 'zotero-api-client';

export async function callZoteroConnection(plugin: RNPlugin) {
	const zoteroApiKey = await plugin.settings.getSetting('zotero-api-key');
	if (zoteroApiKey === undefined || zoteroApiKey === '') {
		await plugin.app.toast(`📝 You need to set your Zotero API key in the settings.`);
		return;
	}
	const zoteroUserId: number = await plugin.settings.getSetting('zotero-user-id');
	if (zoteroUserId === undefined || zoteroUserId === 0 || zoteroUserId === null) {
		await plugin.app.toast(
			`📝 You need to set your Zotero User ID in the settings. You can find this at zotero.org/settings/keys`
		);
		return;
	}

	const zoteroAPIConnection = await api(zoteroApiKey).library('user', zoteroUserId);
	return zoteroAPIConnection;
}
