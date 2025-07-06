// Rename summary: PropertyHydrator -> ZoteroPropertyHydrator; hydrateProperties -> hydrateItemAndCollectionProperties; addMultipleUrlSources -> addAllUrlSources
import { filterAsync, PropertyType, type Rem, type RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import { isTitleLikeField } from '../services/zoteroSchemaToRemNote';
import type { ChangeSet, ZoteroItemData } from '../types/types';
import { generatePowerupCode, stripPowerupSuffix } from '../utils/getCodeName';
import { LogType, logMessage } from '../utils/logging';

export class ZoteroPropertyHydrator {
	private plugin: RNPlugin;

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Hydrates properties for items and collections based on the provided changes.
	 *
	 * //TODO: I think this is heavily dependent on #zoteroSyncManager.ts's buildTreeWithChanges function.
	 *
	 * @param {ChangeSet} changes - The set of changes containing new and updated items and collections.
	 * @returns {Promise<void>} A promise that resolves when the hydration process is complete.
	 *
	 * This function performs the following steps:
	 * 1. Combines new and updated items into a single list and hydrates their properties.
	 * 2. Combines new and updated collections into a single list and hydrates their properties.
	 *
	 * For each item, it:
	 * - Retrieves the corresponding Rem object.
	 * - Sets custom properties and adds content.
	 * - Adds powerups and sets powerup properties.
	 * - Filters and processes properties, setting values based on matching keys.
	 * - Handles special cases for URL properties and title-related fields.
	 *
	 * For each collection, it:
	 * - Retrieves the corresponding Rem object.
	 * - Adds powerups and sets powerup properties.
	 * - Sets the text and other properties for the collection.
	 */
	async hydrateItemAndCollectionProperties(changes: ChangeSet): Promise<void> {
		const itemsToHydrate = [...changes.newItems, ...changes.updatedItems];
		const collectionsToHydrate = [...changes.newCollections, ...changes.updatedCollections];
		// Hydrate properties for items
		for (const item of itemsToHydrate) {
			const rem = item.rem;
			if (rem) {
				// Tag, Safety, and Hydrate item properties here
				// For example, set custom properties or add content
				// await rem.setCustomProperty('authors', item.data.creators);
				const itemTypeCode = generatePowerupCode(item.data.itemType);
				const powerupItemType = await this.plugin.powerup.getPowerupByCode(itemTypeCode);
				if (!powerupItemType) {
					console.error('Powerup not found!');
					return;
				}
				await rem.addPowerup(itemTypeCode);

				// Basic text for notes or annotations
				if (item.data.itemType === 'note' && item.data.note) {
					// create a tree with markdown if there are multiple lines, otherwise set createSingleRem
					if (item.data.note.includes('\n')) {
						const tempRemArray = await this.plugin.rem.createTreeWithMarkdown(
							item.data.note
						);
						if (tempRemArray && tempRemArray.length > 0) {
							// Only set the top-level rems as children, preserving internal hierarchy
							const rootRems = tempRemArray.filter((childRem) => !childRem.parent);
							rootRems.forEach((rootRem) => {
								rootRem.setParent(rem._id);
							});
						}
					} else {
						const tempRem = await this.plugin.rem.createSingleRemWithMarkdown(
							item.data.note
						);
						if (tempRem) {
							tempRem.setParent(rem._id);
						}
					}
				} else if (
					item.data.itemType === 'annotation' &&
					typeof item.data.annotationText === 'string'
				) {
					const tempRem = await this.plugin.rem.createSingleRemWithMarkdown(
						item.data.annotationText
					);
					if (tempRem) {
						tempRem.setParent(rem._id);
					}
				}

				// await rem.setPowerupProperty(powerupCodes.ZITEM, 'key', [item.key]); we add this when we create it
				await rem.setPowerupProperty(powerupCodes.ZITEM, 'version', [String(item.version)]);

				await rem.setPowerupProperty(powerupCodes.ZITEM, 'fullData', [
					JSON.stringify(item.data),
				]);

				const properties = await filterAsync(await powerupItemType.getChildrenRem(), (c) =>
					c.isProperty()
				);

				// Collect all URLs for adding as sources
				const urlSources: string[] = [];

				for (const property of properties) {
					if (!property.text || property.text.length === 0) continue;

					const propertyKey = stripPowerupSuffix(property.text[0] as string);
					const formattedKey = propertyKey.toLowerCase().replace(/\s/g, '');

					// **Skip the 'key' property to prevent overwriting**
					if (formattedKey === 'key') continue;

					const matchingKey = Object.keys(item.data).find(
						(key) => key.toLowerCase().replace(/\s/g, '') === formattedKey
					);

					if (!matchingKey) {
						logMessage(
							this.plugin,
							`No matching key for property: ${formattedKey}`,
							LogType.Info
						);
						continue;
					}

					const propertyValue = item.data[matchingKey];
					if (!propertyValue) continue;

					const propertyType = await property.getPropertyType();
					const slotCode = await this.plugin.powerup.getPowerupSlotByCode(
						itemTypeCode,
						generatePowerupCode(matchingKey)
					);

					if (!slotCode) {
						console.error('Slot code not found for property:', matchingKey);
						continue;
					}

					if (isTitleLikeField(matchingKey)) {
						const safeTitle = await this.plugin.richText.parseFromMarkdown(
							propertyValue
						);
						await rem.setText(safeTitle);
						continue;
					}

					if (propertyType === PropertyType.URL) {
						const linkID = await this.plugin.rem.createLinkRem(propertyValue, true);
						if (!linkID) {
							console.error('Failed to create link rem for URL:', propertyValue);
							continue;
						}
						await rem.setTagPropertyValue(
							slotCode._id,
							// @ts-ignore
							this.plugin.richText.rem(linkID).richText
						);
						// Collect URL for adding as source
						urlSources.push(propertyValue);
					} else {
						await rem.setTagPropertyValue(slotCode._id, [propertyValue]);
					}
				}

				// Handle multiple URLs as sources
				await this.addAllUrlSources(rem, item.data, urlSources);
			}
		}

		// Hydrate properties for collections if needed
		for (const collection of collectionsToHydrate) {
			const rem = collection.rem;
			if (rem) {
				// Tag, Safety, and Hydrate collection properties here
				await rem.addPowerup(powerupCodes.COLLECTION);
				await rem.setText([collection.name]);
				await rem.setPowerupProperty(powerupCodes.COLLECTION, 'key', [collection.key]);
				await rem.setPowerupProperty(powerupCodes.COLLECTION, 'version', [
					String(collection.version),
				]);

				await rem.setPowerupProperty(powerupCodes.COLLECTION, 'name', [collection.name]);
			}
		}
	}

	/**
	 * Adds multiple URLs as sources to a Rem for RemNote Reader interoperability.
	 * Handles various URL-like fields from Zotero items including DOI, archive URLs, etc.
	 *
	 * @param rem - The RemNote Rem to add sources to
	 * @param itemData - The Zotero item data containing potential URL fields
	 * @param existingUrls - URLs that have already been processed from the property loop
	 */
	private async addAllUrlSources(
		rem: Rem,
		itemData: ZoteroItemData,
		existingUrls: string[]
	): Promise<void> {
		const urlsToAdd = new Set<string>();

		// Add URLs that were already processed in the property loop
		existingUrls.forEach((url) => {
			if (this.isValidUrlString(url)) {
				urlsToAdd.add(url);
			}
		});

		// Additional URL-like fields that might not be caught in the property loop
		const additionalUrlFields = ['DOI', 'archive', 'repository'];

		for (const field of additionalUrlFields) {
			const value = itemData[field];
			if (value && typeof value === 'string') {
				let processedUrl = value;

				// Handle DOI conversion to URL
				if (field === 'DOI' && !value.startsWith('http')) {
					processedUrl = `https://doi.org/${value}`;
				}

				if (this.isValidUrlString(processedUrl)) {
					urlsToAdd.add(processedUrl);
				}
			}
		}

		// Add all valid URLs as sources
		for (const url of urlsToAdd) {
			try {
				const linkID = await this.plugin.rem.createLinkRem(url, true);
				if (linkID) {
					await rem.addSource(linkID);
					// logMessage(this.plugin, `Added URL source: ${url}`, LogType.Info, false);
				}
			} catch (error) {
				console.error(`Failed to add URL source ${url}:`, error);
				logMessage(this.plugin, `Failed to add URL source: ${url}`, LogType.Error);
			}
		}
	}

	/**
	 * Validates if a string is a valid URL
	 * @param url - The string to validate
	 * @returns true if the string is a valid URL, false otherwise
	 */
	private isValidUrlString(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}
}
