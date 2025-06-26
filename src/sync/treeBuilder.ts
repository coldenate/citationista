import { RNPlugin, Rem, filterAsync } from '@remnote/plugin-sdk';
import { Collection, Item, RemNode, ChangeSet } from '../types/types';
import { powerupCodes } from '../constants/constants';
import { logMessage, LogType } from '../utils/logging';
import { getUnfiledItemsRem, getZoteroLibraryRem } from '../services/ensureUIPrettyZoteroRemExist';

export class TreeBuilder {
	getNodeCache(): Map<string, RemNode> {
		return this.nodeCache;
	}
	private plugin: RNPlugin;
	private nodeCache: Map<string, RemNode> = new Map();

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Initializes the node cache by fetching all Rems tagged with specific power-ups
	 * and storing relevant information in the cache.
	 *
	 * The node cache is a Map that maintains associations between Zotero objects and their
	 * corresponding RemNote Rems. It maps Zotero IDs (keys) to RemNode objects containing:
	 * - remId: The RemNote Rem identifier
	 * - zoteroId: The Zotero object's unique key
	 * - zoteroParentId: The parent object's ID (collection or item parent)
	 * - rem: The actual RemNote Rem object
	 *
	 * This cache enables efficient:
	 * - Quick lookups of RemNote Rems by Zotero ID
	 * - Tracking of parent-child relationships between objects
	 * - Tree operations (creation, updates, moves, deletions) without repeated database queries
	 *
	 * This method performs the following steps:
	 * 1. Logs the start of the initialization process.
	 * 2. Fetches the power-ups for collections and items.
	 * 3. Retrieves all Rems tagged with the collection and item power-ups.
	 * 4. Filters out power-up definition Rems.
	 * 5. Logs the number of collection and item Rems found.
	 * 6. Iterates over the collection Rems, extracting the Zotero ID and parent collection ID,
	 *    and stores them in the node cache.
	 * 7. Iterates over the item Rems, extracting the Zotero ID and collection ID,
	 *    and stores them in the node cache.
	 * 8. Logs the completion of the initialization process.
	 *
	 * @throws {Error} If the required power-ups are not found.
	 * @returns {Promise<void>} A promise that resolves when the node cache has been initialized.
	 */
	async initializeNodeCache(): Promise<void> {
		logMessage(this.plugin, 'Initializing Node Cache', LogType.Info, false);

		const collectionPowerup = await this.plugin.powerup.getPowerupByCode(
			powerupCodes.COLLECTION
		);
		const itemPowerup = await this.plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);
		if (!collectionPowerup || !itemPowerup) {
			throw new Error('Required powerups not found');
		}
		let itemRems = await itemPowerup.taggedRem();
		let collectionRems = await collectionPowerup.taggedRem();

		// Filter out definition Rems.
		itemRems = await filterAsync(itemRems, async (rem) => !(await rem.isPowerup()));
		collectionRems = await filterAsync(collectionRems, async (rem) => !(await rem.isPowerup()));

		logMessage(
			this.plugin,
			`Found ${collectionRems.length} collection Rems and ${itemRems.length} item Rems already in RemNote.`,
			LogType.Info
		);

		// Populate nodeCache for collections.
		for (const rem of collectionRems) {
			const zoteroId = await rem.getPowerupProperty(powerupCodes.COLLECTION, 'key');
			if (!zoteroId) {
				console.warn('Collection Rem missing key property:', rem._id);
				continue;
			}
			const parentZoteroId = await rem.getPowerupProperty(
				powerupCodes.COLLECTION,
				'parentCollection'
			);
			this.nodeCache.set(zoteroId, {
				remId: rem._id,
				zoteroId,
				zoteroParentId: parentZoteroId || null,
				rem,
			});
		}

		// Populate nodeCache for items.
		for (const rem of itemRems) {
			const zoteroId = await rem.getPowerupProperty(powerupCodes.ZITEM, 'key');
			if (!zoteroId) {
				logMessage(this.plugin, `Item Rem missing key property: ${rem._id}`, LogType.Info);
				continue;
			}
			const parentZoteroId = await rem.getPowerupProperty(powerupCodes.ZITEM, 'collection');
			this.nodeCache.set(zoteroId, {
				remId: rem._id,
				zoteroId,
				zoteroParentId: parentZoteroId || null,
				rem,
			});
		}

		logMessage(this.plugin, 'Node Cache Initialized', LogType.Info, false, this.nodeCache);
	}

	async applyChanges(changes: ChangeSet): Promise<void> {
		await this.handleCollections(changes);
		await this.handleItems(changes);
	}

	private async handleCollections(changes: ChangeSet): Promise<void> {
		await this.createCollections(changes.newCollections);
		await this.updateCollections(changes.updatedCollections);
		await this.deleteCollections(changes.deletedCollections);
		await this.moveCollections([
			...changes.newCollections,
			...changes.movedCollections,
			...changes.updatedCollections,
		]);
	}

	private async handleItems(changes: ChangeSet): Promise<void> {
		await this.createItems(changes.newItems);
		await this.updateItems(changes.updatedItems);
		await this.deleteItems(changes.deletedItems);
		await this.moveItems([...changes.newItems, ...changes.movedItems, ...changes.updatedItems]);
	}

	// Collection methods.
	private async createCollections(collections: Collection[]): Promise<void> {
		for (const collection of collections) {
			const rem = await this.plugin.rem.createRem();
			if (!rem) continue;
			await rem.addPowerup(powerupCodes.COLLECTION);
			await rem.setPowerupProperty(powerupCodes.COLLECTION, 'key', [collection.key]);
			collection.rem = rem;
			this.nodeCache.set(collection.key, {
				remId: rem._id,
				zoteroId: collection.key,
				zoteroParentId: collection.parentCollection || null,
				rem,
			});
		}
	}

	private async updateCollections(collections: Collection[]): Promise<void> {
		for (const collection of collections) {
			const remNode = this.nodeCache.get(collection.key);
			if (remNode) {
				await remNode.rem.setText([collection.name]);
				collection.rem = remNode.rem;
				const newParentId = collection.parentCollection || null;
				if (remNode.zoteroParentId !== newParentId) {
					remNode.zoteroParentId = newParentId;
				}
			} else {
				logMessage(
					this.plugin,
					`Collection ${collection.key} not found, creating it`,
					LogType.Info
				);
				await this.createCollections([collection]);
			}
		}
	}

	private async deleteCollections(collections: Collection[]): Promise<void> {
		for (const collection of collections) {
			const remNode = this.nodeCache.get(collection.key);
			if (remNode) {
				await remNode.rem.remove();
				this.nodeCache.delete(collection.key);
			}
		}
	}

	private async moveCollections(collections: Collection[]): Promise<void> {
		for (const collection of collections) {
			const remNode = this.nodeCache.get(collection.key);
			if (remNode) {
				const newParentId = collection.parentCollection || null;
				const parentNode = newParentId ? this.nodeCache.get(newParentId) : null;
				if (parentNode) {
					await remNode.rem.setParent(parentNode.rem);
				} else {
					// Fallback: assign to the Zotero Library Rem.
					const zoteroLibraryRem = await getZoteroLibraryRem(this.plugin);
					if (zoteroLibraryRem) {
						await remNode.rem.setParent(zoteroLibraryRem);
					}
				}
				remNode.zoteroParentId = newParentId;
			}
		}
	}

	// Item methods.
	private async createItems(items: Item[]): Promise<void> {
		for (const item of items) {
			const rem = await this.plugin.rem.createRem();
			if (!rem) {
				console.error('Failed to create Rem for item:', item.key);
				continue;
			}
			await rem.addPowerup(powerupCodes.ZITEM);
			await rem.setPowerupProperty(powerupCodes.ZITEM, 'key', [item.key]);
			const remKey = await rem.getPowerupProperty(powerupCodes.ZITEM, 'key');
			if (!remKey) {
				console.error('Key not set for item:', item.key);
				continue;
			}
			item.rem = rem;
			this.nodeCache.set(item.key, {
				remId: rem._id,
				zoteroId: item.key,
				zoteroParentId:
					item.data.parentItem ||
					(item.data.collections && item.data.collections[0]) ||
					null,
				rem,
			});
		}
	}

	private async updateItems(items: Item[]): Promise<void> {
		for (const item of items) {
			const remNode = this.nodeCache.get(item.key);
			if (remNode) {
				await remNode.rem.setText([item.data.title ?? '']);
				item.rem = remNode.rem;
				const newParentId =
					item.data.parentItem ||
					(item.data.collections && item.data.collections[0]) ||
					null;
				if (remNode.zoteroParentId !== newParentId) {
					remNode.zoteroParentId = newParentId;
				}
			} else {
				logMessage(this.plugin, `Item ${item.key} not found, creating it`, LogType.Info);
				await this.createItems([item]);
			}
		}
	}

	private async deleteItems(items: Item[]): Promise<void> {
		for (const item of items) {
			const remNode = this.nodeCache.get(item.key);
			if (remNode) {
				await remNode.rem.remove();
				this.nodeCache.delete(item.key);
			}
		}
	}

	private async moveItems(items: Item[]): Promise<void> {
                const unfiledZoteroItemsRem = await getUnfiledItemsRem(this.plugin);
                const multipleCollectionsBehavior = (await this.plugin.settings.getSetting(
                        'multiple-colections-behavior'
                )) as 'portal' | 'reference';
                console.log('Multiple Collections Behavior:', multipleCollectionsBehavior);
                const listOfUnfiledItems = [];
                for (const item of items) {
                        const remNode = this.nodeCache.get(item.key);
                        if (!remNode) continue;

                        const parentNodes: RemNode[] = [];

                        // Include parentItem if available.
                        if (item.data.parentItem) {
                                const parentItemNode = this.nodeCache.get(item.data.parentItem);
                                if (parentItemNode) parentNodes.push(parentItemNode);
                        }

                        // Include collections.
                        if (item.data.collections && item.data.collections.length > 0) {
                                for (const collectionId of item.data.collections) {
                                        const collectionNode = this.nodeCache.get(collectionId);
                                        if (collectionNode) {
                                                parentNodes.push(collectionNode);
                                        } else {
                                                console.warn(
                                                        `Collection ${collectionId} not found for item ${item.key}`
                                                );
                                        }
                                }
                        }

                        if (parentNodes.length === 0) {
                                listOfUnfiledItems.push(item);
                                if (unfiledZoteroItemsRem) {
                                        await remNode.rem.setParent(unfiledZoteroItemsRem);
                                }
                                continue;
                        }

                        const primaryParent = parentNodes[0];
                        await remNode.rem.setParent(primaryParent.rem);

                        if (multipleCollectionsBehavior === 'portal') {
                                for (let i = 1; i < parentNodes.length; i++) {
                                        console.log('Adding portal to parent:', parentNodes[i].remId);
                                        const additionalParent = parentNodes[i];
                                        const portal = await this.plugin.rem.createPortal();
                                        portal?.setParent(additionalParent.rem);
                                        remNode.rem.addToPortal(portal!);
                                }
                        } else if (multipleCollectionsBehavior === 'reference') {
                                for (let i = 1; i < parentNodes.length; i++) {
                                        console.log('Creating reference for parent:', parentNodes[i].remId);
                                        const additionalParent = parentNodes[i];
                                        const emptyRem = await this.plugin.rem.createRem();
                                        emptyRem?.setParent(additionalParent.rem);
                                        emptyRem?.setText([{ i: 'q', _id: remNode.rem._id }]); // a workaround behavior
                                }
                        }

                        remNode.zoteroParentId = primaryParent.zoteroId;
                }
                console.log('Unfiled Items:', listOfUnfiledItems);
	}
}
