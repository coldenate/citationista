import { RNPlugin } from '@remnote/plugin-sdk';
import { getAllRemNoteCollections } from './fetchFromRemNote';

export async function findCollection(
	plugin: RNPlugin,
	collectionKey: string | false,
	collectionName: string | false
) {
	// check to must have one of the two parameters
	if (!collectionKey && !collectionName) {
		console.error('Must have one of the two parameters');
		return;
	}
	const collections = await getAllRemNoteCollections(plugin);

	// if we have the collectionKey, search for the collection with that key in RemNote and return it
	if (collectionKey) {
		if (collections === undefined) {
			console.error('No collections found in RemNote');
			return;
		}
		for (const collection of collections) {
			if (collection.key[0] === collectionKey) {
				return collection;
			}
		}
		console.log(collectionKey);
		console.error('No collection found with that key');
		return;
	}
	// if we have the collectionName, search for the collection with that name in RemNote and return it
	if (collectionName) {
		if (collections === undefined) {
			console.error('No collections found in RemNote');
			return;
		}
		for (const collection of collections) {
			if (collection.name[0] === collectionName) {
				return collection;
			}
		}
		console.error('No collection found with that name');
		return;
	}
}
