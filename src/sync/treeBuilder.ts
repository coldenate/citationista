import { filterAsync, type RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import { getUnfiledItemsRem, getZoteroLibraryRem } from '../services/ensureUIPrettyZoteroRemExist';
import { checkAbortFlag, createRem } from '../services/pluginIO';
import type { ChangeSet, Collection, Item, RemNode } from '../types/types';
import { generatePowerupCode } from '../utils/getCodeName';
import { LogType, logMessage } from '../utils/logging';

export class TreeBuilder {
	getNodeCache(): Map<string, RemNode> {
		return this.nodeCache;
	}

	private plugin: RNPlugin;
	private nodeCache: Map<string, RemNode> = new Map();
	private libraryKey: string | null = null;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	setLibraryKey(key: string) {
		this.libraryKey = key;
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
		this.nodeCache.clear();
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
			if (await checkAbortFlag(this.plugin)) return;
			const zoteroId = await rem.getPowerupProperty(powerupCodes.COLLECTION, 'key');
			if (!zoteroId) {
				await logMessage(
					this.plugin,
					`Collection Rem missing key property: ${rem._id}`,
					LogType.Warning,
					false
				);
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

		logMessage(
			this.plugin,
			'Node Cache Initialized',
			LogType.Info,
			false,
			Object.fromEntries(this.nodeCache)
		);
	}

       async applyChanges(
               changes: ChangeSet,
               onProgress?: () => Promise<void>
       ): Promise<void> {
               await this.handleCollections(changes, onProgress);
               await this.handleItems(changes, onProgress);
       }

       private async handleCollections(
               changes: ChangeSet,
               onProgress?: () => Promise<void>
       ): Promise<void> {
               await this.createCollections(changes.newCollections, onProgress);
               await this.updateCollections(changes.updatedCollections, onProgress);
               await this.deleteCollections(changes.deletedCollections, onProgress);
               await this.moveCollections([
                       ...changes.newCollections,
                       ...changes.movedCollections,
                       ...changes.updatedCollections,
               ], onProgress);
       }

       private async handleItems(
               changes: ChangeSet,
               onProgress?: () => Promise<void>
       ): Promise<void> {
               await this.createItems(changes.newItems, onProgress);
               await this.updateItems(changes.updatedItems, onProgress);
               await this.deleteItems(changes.deletedItems, onProgress);
               await this.moveItems(
                       [...changes.newItems, ...changes.movedItems, ...changes.updatedItems],
                       onProgress
               );
       }

	// Collection methods.
       private async createCollections(
               collections: Collection[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               for (const collection of collections) {
                       const rem = await createRem(this.plugin, this.libraryKey ?? undefined);
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
                       if (onProgress) await onProgress();
               }
       }

       private async updateCollections(
               collections: Collection[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
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
                       if (onProgress) await onProgress();
               }
       }

       private async deleteCollections(
               collections: Collection[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               const deletionPromises: Promise<void>[] = [];
               for (const collection of collections) {
                       const remNode = this.nodeCache.get(collection.key);
                       if (remNode) {
                               deletionPromises.push(remNode.rem.remove());
                               this.nodeCache.delete(collection.key);
                               if (onProgress) await onProgress();
                       }
               }
               await Promise.all(deletionPromises);
       }

       private async moveCollections(
               collections: Collection[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               for (const collection of collections) {
                       const remNode = this.nodeCache.get(collection.key);
                       if (remNode) {
                               const newParentId = collection.parentCollection || null;
                               const parentNode = newParentId ? this.nodeCache.get(newParentId) : null;
                               if (parentNode) {
                                       await remNode.rem.setParent(parentNode.rem);
                               } else {
                                       // Fallback: assign to the Zotero Library Rem.

					const zoteroLibraryRem = await getZoteroLibraryRem(
						this.plugin,
						this.libraryKey ?? undefined
					);

                                       if (zoteroLibraryRem) {
                                               await remNode.rem.setParent(zoteroLibraryRem);
                                       }
                               }
                               remNode.zoteroParentId = newParentId;
                               if (onProgress) await onProgress();
                       }
               }
       }

	// Item methods.
       private async createItems(
               items: Item[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               for (const item of items) {
                       if (await checkAbortFlag(this.plugin)) return;
			const itemTypeCode = generatePowerupCode(item.data.itemType);
			const itemTypePowerup = await this.plugin.powerup.getPowerupByCode(itemTypeCode);

			if (!itemTypePowerup) {
				logMessage(
					this.plugin,
					`Power-up ${itemTypeCode} not found for item ${item.key}`,
					LogType.Error
				);
				// Skip adding the specific item type power-up but continue
			}

			const rem = await createRem(this.plugin, this.libraryKey ?? undefined);
			if (!rem) {
				await logMessage(
					this.plugin,
					`Failed to create Rem for item: ${item.key}`,
					LogType.Error
				);
				continue;
			}
			await rem.addPowerup(powerupCodes.ZITEM);
			if (itemTypePowerup) {
				await rem.addPowerup(itemTypeCode);
			}
			await rem.setPowerupProperty(powerupCodes.ZITEM, 'key', [item.key]);
			const remKey = await rem.getPowerupProperty(powerupCodes.ZITEM, 'key');
			if (!remKey) {
				await logMessage(this.plugin, `Key not set for item: ${item.key}`, LogType.Error);
				continue;
			}
			item.rem = rem;
                       this.nodeCache.set(item.key, {
                               remId: rem._id,
                               zoteroId: item.key,
                               zoteroParentId: item.data.parentItem || item.data.collections?.[0] || null,
                               rem,
                       });
                       if (onProgress) await onProgress();
               }
       }

       private async updateItems(
               items: Item[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               for (const item of items) {
                       if (await checkAbortFlag(this.plugin)) return;
			const remNode = this.nodeCache.get(item.key);
			if (remNode) {
				const safeTitle = await this.plugin.richText.parseFromMarkdown(
					item.data.title ?? ''
				);
				await remNode.rem.setText(safeTitle);
				item.rem = remNode.rem;
				const newParentId = item.data.parentItem || item.data.collections?.[0] || null;
				if (remNode.zoteroParentId !== newParentId) {
					remNode.zoteroParentId = newParentId;
				}
			} else {
				await logMessage(
					this.plugin,
					`Item ${item.key} not found, creating it`,
					LogType.Info
				);
                               await this.createItems([item]);
                       }
                       if (onProgress) await onProgress();
               }
       }

       private async deleteItems(
               items: Item[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               const deletionPromises: Promise<void>[] = [];
               for (const item of items) {
                       if (await checkAbortFlag(this.plugin)) return;
                       const remNode = this.nodeCache.get(item.key);
                       if (remNode) {
                               deletionPromises.push(remNode.rem.remove());
                               this.nodeCache.delete(item.key);
                               if (onProgress) await onProgress();
                       }
               }
               await Promise.all(deletionPromises);
       }

       private async moveItems(
               items: Item[],
               onProgress?: () => Promise<void>
       ): Promise<void> {
               const unfiledZoteroItemsRem = await getUnfiledItemsRem(
                       this.plugin,
                       this.libraryKey ?? undefined
               );

		const multipleCollectionsBehavior = (await this.plugin.settings.getSetting(
			'multiple-colections-behavior'
		)) as 'portal' | 'reference';
		await logMessage(
			this.plugin,
			`Multiple Collections Behavior: ${multipleCollectionsBehavior}`,
			LogType.Debug,
			false
		);
		const listOfUnfiledItems = [];
		for (const item of items) {
			if (await checkAbortFlag(this.plugin)) return;
			const remNode = this.nodeCache.get(item.key);
			if (remNode) {
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
							await logMessage(
								this.plugin,
								`Collection ${collectionId} not found for item ${item.key}`,
								LogType.Warning,
								false
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

				if (parentNodes.length > 0) {
					const primaryParent = parentNodes[0];
					await remNode.rem.setParent(primaryParent.rem);
					if (multipleCollectionsBehavior === 'portal') {
						for (let i = 1; i < parentNodes.length; i++) {
							await logMessage(
								this.plugin,
								`Adding portal to parent: ${parentNodes[i].remId}`,
								LogType.Debug,
								false
							);
							const additionalParent = parentNodes[i];
							const portal = await this.plugin.rem.createPortal();
							if (portal) {
								portal.setParent(additionalParent.rem);
								remNode.rem.addToPortal(portal);
							}
						}
					} else if (multipleCollectionsBehavior === 'reference') {
						for (let i = 1; i < parentNodes.length; i++) {
							await logMessage(
								this.plugin,
								`Creating reference for parent: ${parentNodes[i].remId}`,
								LogType.Debug,
								false
							);
							const additionalParent = parentNodes[i];
							const emptyRem = await createRem(
								this.plugin,
								this.libraryKey ?? undefined
							);
							emptyRem?.setParent(additionalParent.rem);
							emptyRem?.setText([{ i: 'q', _id: remNode.rem._id }]); // a workaround behavior
						}
					}
                                        remNode.zoteroParentId = primaryParent.zoteroId;
                                }
                        }
                        if (remNode && onProgress) await onProgress();
                }
                await logMessage(
                        this.plugin,
                        `Unfiled Items: ${listOfUnfiledItems.length}`,
                        LogType.Debug,
			false
		);
	}
}
