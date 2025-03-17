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

	async initializeNodeCache(): Promise<void> {
		logMessage(this.plugin, 'Initializing Node Cache', LogType.Info, false);
		// Fetch all Rems with the 'zoteroId' property
		const collectionPowerup = await this.plugin.powerup.getPowerupByCode(
			powerupCodes.COLLECTION
		);
		const itemPowerup = await this.plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);

		if (!collectionPowerup || !itemPowerup) {
			throw new Error('Required powerups not found');
		}

		// Get all Rems tagged with the power-ups
		let itemRems = await itemPowerup.taggedRem();
		let collectionRems = await collectionPowerup.taggedRem();

		// Filter out power-up definition Rems
		itemRems = await filterAsync(itemRems, async (rem) => !(await rem.isPowerup()));
		collectionRems = await filterAsync(collectionRems, async (rem) => !(await rem.isPowerup()));

		logMessage(
			this.plugin,
			`Found ${collectionRems.length} collection Rems and ${itemRems.length} item Rems`,
			LogType.Info
		);

		for (const rem of collectionRems) {
			const zoteroId = await rem.getPowerupProperty(powerupCodes.COLLECTION, 'key');
			if (!zoteroId) {
				console.warn('Collection Rem missing key property:', rem._id);
				continue; // Skip this rem
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

		for (const rem of itemRems) {
			const zoteroId = await rem.getPowerupProperty(powerupCodes.ZITEM, 'key');
			if (!zoteroId) {
				logMessage(this.plugin, `Item Rem missing key property: ${rem._id}`, LogType.Info);
				continue; // Skip this rem
			}
			const parentZoteroId = await rem.getPowerupProperty(powerupCodes.ZITEM, 'collection');
			this.nodeCache.set(zoteroId, {
				remId: rem._id,
				zoteroId,
				zoteroParentId: parentZoteroId || null, // FIXME: only works if there is one collection, but there can be more. to fix this, we'll need to go to types.ts and refactor the type, thne refactor all the code referencing it to use the list.
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

	// Collection methods
	private async createCollections(collections: Collection[]): Promise<void> {
		for (const collection of collections) {
			const rem = await this.plugin.rem.createRem();
			if (!rem) continue;

			await rem.addPowerup(powerupCodes.COLLECTION);
			await rem.setPowerupProperty(powerupCodes.COLLECTION, 'key', [collection.key]);

			collection.rem = rem;

			// await rem.setText([collection.data.name]);
			// Add powerup tags or properties if needed

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
					// Re-parenting is handled in moveCollections
				}
			} else {
				// Rem doesn't exist, create it
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
					// Assign to root or a default parent
					const zoteroLibraryRem = await getZoteroLibraryRem(this.plugin);
					if (zoteroLibraryRem) {
						await remNode.rem.setParent(zoteroLibraryRem);
					}
				}
				remNode.zoteroParentId = newParentId;
			}
		}
	}
	// Item methods
	private async createItems(items: Item[]): Promise<void> {
		for (const item of items) {
			const rem = await this.plugin.rem.createRem();
			if (!rem) {
				console.error('Failed to create Rem for item:', item.key);
				continue;
			}

			await rem.addPowerup(powerupCodes.ZITEM);
			await rem.setPowerupProperty(powerupCodes.ZITEM, 'key', [item.key]);

			// check if the key was set
			const remKey = await rem.getPowerupProperty(powerupCodes.ZITEM, 'key');
			if (!remKey) {
				console.error('Key not set for item:', item.key);
				continue;
			}

			item.rem = rem;
			// await rem.setText([item.data.title]);
			// Add powerup tags or properties if needed

			this.nodeCache.set(item.key, {
				remId: rem._id,
				zoteroId: item.key,
				zoteroParentId: item.data.parentItem || item.data.collections[0] || null,
				rem,
			});
		}
	}

	private async updateItems(items: Item[]): Promise<void> {
		for (const item of items) {
			const remNode = this.nodeCache.get(item.key);
			if (remNode) {
				const rem = remNode.rem;
				await remNode.rem.setText([item.data.title]);
				item.rem = rem;

				const newParentId = item.data.parentItem || item.data.collections[0] || null;
				if (remNode.zoteroParentId !== newParentId) {
					remNode.zoteroParentId = newParentId;
					// Re-parenting is handled in moveItems
				}
			} else {
				// Rem doesn't exist, create it
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
			if (remNode) {
				const parentNodes: RemNode[] = [];

				// Include parentItem if it exists
				if (item.data.parentItem) {
					const parentItemNode = this.nodeCache.get(item.data.parentItem);
					if (parentItemNode) {
						parentNodes.push(parentItemNode);
					}
				}

				// Include all collections
				if (item.data.collections && item.data.collections.length > 0) {
					for (const collectionId of item.data.collections) {
						const collectionNode = this.nodeCache.get(collectionId);
						if (collectionNode) {
							parentNodes.push(collectionNode);
						} else {
							// Log missing collection
							console.warn(
								`Collection ${collectionId} not found for item ${item.key}`
							);
						}
					}
				} else {
					// If no collections or parentItem, assign to root
					listOfUnfiledItems.push(remNode);
					if (unfiledZoteroItemsRem) {
						await remNode.rem.setParent(unfiledZoteroItemsRem);
					}
					continue;
				}

				if (parentNodes.length > 0) {
					// Set primary parent
					const primaryParent = parentNodes[0];
					await remNode.rem.setParent(primaryParent.rem);

					if (multipleCollectionsBehavior === 'portal') {
						// Add portals to other parents
						for (let i = 1; i < parentNodes.length; i++) {
							console.log('Adding portal to parent:', parentNodes[i].remId);
							const additionalParent = parentNodes[i];
							const portal = await this.plugin.rem.createPortal();
							portal?.setParent(additionalParent.rem);
							remNode.rem.addToPortal(portal!);
						}
					} else if (multipleCollectionsBehavior === 'reference') {
						// Create separate references for each parent
						for (let i = 1; i < parentNodes.length; i++) {
							console.log('Creating reference for parent:', parentNodes[i].remId);
							const additionalParent = parentNodes[i];
							const emptyRem = await this.plugin.rem.createRem();
							emptyRem?.setParent(additionalParent.rem);
							emptyRem?.setText([{ i: 'q', _id: remNode.rem._id }]); //what the hell is this?? why does this work??
						}
					}

					// Update remNode.zoteroParentId
					remNode.zoteroParentId = primaryParent.zoteroId;
				}
			}
		}
		console.log('Unfiled Items:', listOfUnfiledItems);
	}
}
