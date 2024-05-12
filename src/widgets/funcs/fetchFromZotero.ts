import { RNPlugin } from '@remnote/plugin-sdk';
import { callZoteroConnection } from '../utils/callZoteroConnection';

export async function getAllZoteroItems(plugin: RNPlugin) {
	// get all items from Zotero
	const zoteroItems = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroItemsResponse = await zoteroAPIConnection.items().get();

	for (const item of zoteroItemsResponse.raw) {
		zoteroItems.push(item);
	}
	return zoteroItems;
}

async function getItemFromZotero(plugin: RNPlugin, itemKey: string) {
	// get individual item from Zotero via key (I don't even think this is possible)
}
// function: get all collections from zotero

export async function getAllZoteroCollections(plugin: RNPlugin) {
	const zoteroCollections = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroCollectionsResponse = await zoteroAPIConnection.collections().get();
	const zoteroCollectionsData = zoteroCollectionsResponse.getData();
	for (const collection of zoteroCollectionsData) {
		zoteroCollections.push(collection);
	}
	return zoteroCollections;
}
