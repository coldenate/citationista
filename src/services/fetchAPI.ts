import { RNPlugin } from '@remnote/plugin-sdk';
// @ts-ignore
import api from 'zotero-api-client';
import { Collection, Item } from '../types/types';

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

export async function getAllZoteroItems(plugin: RNPlugin) {
	const zoteroItems: Item[] = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroItemsResponse = await zoteroAPIConnection.items().get();

	for (const item of zoteroItemsResponse.raw) {
		zoteroItems.push(item);
	}
	return zoteroItems;
}

export async function getAllZoteroCollections(plugin: RNPlugin) {
	const zoteroCollections: Collection[] = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroCollectionsResponse = await zoteroAPIConnection.collections().get();
	const zoteroCollectionsData = zoteroCollectionsResponse.getData();
	for (const collection of zoteroCollectionsData) {
		zoteroCollections.push(collection);
	}
	return zoteroCollections;
}
