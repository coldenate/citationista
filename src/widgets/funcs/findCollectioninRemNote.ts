import { RNPlugin } from '@remnote/plugin-sdk';
import { getAllRemNoteCollections } from './fetchFromRemNote';
import { isDebugMode } from '..';
import { LogType, logMessage } from './logging';

export async function findCollection( // TODO: ideally, caching the should be used here
	plugin: RNPlugin,
	collectionKey: string | false,
	collectionName: string | false
) {
	const debugMode = await isDebugMode(plugin);
	// check to must have one of the two parameters
	if (!collectionKey && !collectionName) {
		await logMessage({
			plugin,
			message: 'Must have one of the two parameters',
			type: LogType.Error,
			consoleEmitType: 'error',
			isToast: false,
		});
		return;
	}
	const collections = await getAllRemNoteCollections(plugin);

	// if we have the collectionKey, search for the collection with that key in RemNote and return it
	if (collectionKey) {
		if (collections === undefined) {
			// if (debugMode) console.error('No collections found in RemNote');
			await logMessage({
				plugin,
				message: 'No collections found in RemNote',
				type: LogType.Error,
				consoleEmitType: 'error',
				isToast: false,
			});
			return;
		}
		const foundCollection = collections.find((collection) => collection.key === collectionKey);
		if (foundCollection) {
			return foundCollection;
		}
		await logMessage({
			plugin,
			message: 'No collection found with that key',
			type: LogType.Error,
			consoleEmitType: 'error',
			isToast: false,
		});
		await logMessage({
			plugin,
			message: collectionKey,
			type: LogType.Info,
			consoleEmitType: 'info',
			isToast: false,
		});
		return;
	}
	// if we have the collectionName, search for the collection with that name in RemNote and return it
	if (collectionName) {
		if (collections === undefined) {
			await logMessage({
				plugin,
				message: 'No collections found in RemNote',
				type: LogType.Error,
				consoleEmitType: 'error',
				isToast: false,
			});
			return;
		}
		for (const collection of collections) {
			if (collection.name[0] === collectionName) {
				return collection;
			}
		}
		await logMessage({
			plugin,
			message: 'No collection found with that name',
			type: LogType.Error,
			consoleEmitType: 'error',
			isToast: false,
		});
		return;
	}
}
