/** Populates Rem properties using Zotero item metadata. */
import { filterAsync, PropertyType, type Rem, type RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import { itemTypeFieldLookup } from '../constants/zoteroItemSchema';
import { checkAbortFlag, createRem } from '../services/pluginIO';
import { getItemTitle } from '../services/zoteroSchemaToRemNote';
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
	async hydrateItemAndCollectionProperties(
		changes: ChangeSet,
		onProgress?: () => Promise<void>
	): Promise<void> {
		const itemsToHydrate = [...changes.newItems, ...changes.updatedItems];
		const collectionsToHydrate = [...changes.newCollections, ...changes.updatedCollections];
		// Hydrate properties for items
		for (const item of itemsToHydrate) {
			if (await checkAbortFlag(this.plugin)) return;
			const rem = item.rem;
			if (rem) {
				// Tag, Safety, and Hydrate item properties here
				// For example, set custom properties or add content
				// await rem.setCustomProperty('authors', item.data.creators);
				const itemTypeCode = generatePowerupCode(item.data.itemType);
				const powerupItemType = await this.plugin.powerup.getPowerupByCode(itemTypeCode);
				if (!powerupItemType) {
					await logMessage(this.plugin, 'Powerup not found!', LogType.Error);
					return;
				}
				await rem.addPowerup(itemTypeCode);

				// Basic text for notes or annotations
				if (item.data.itemType === 'note' && item.data.note) {
					await this.hydrateTextContent(rem, item.data.note, 'Note');
				} else if (
					item.data.itemType === 'annotation' &&
					typeof item.data.annotationText === 'string'
				) {
					await this.hydrateTextContent(rem, item.data.annotationText, 'Annotation');
				}

                                const itemTitle = getItemTitle(item.data);
                                if (itemTitle) {
                                        const safeTitle = await this.plugin.richText.parseFromMarkdown(
                                                String(itemTitle)
                                        );
                                        await rem.setText(safeTitle);
                                }

                                // We already add the KEY property when we create it, so there is no need to set it again
                                await rem.setPowerupProperty(powerupCodes.ZITEM, 'version', [String(item.version)]);

				await rem.setPowerupProperty(powerupCodes.ZITEM, 'fullData', [
					JSON.stringify(item.data),
				]);

                                const properties = await filterAsync(await powerupItemType.getChildrenRem(), (c) =>
                                        c.isProperty()
                                );
                                const allowedFields = itemTypeFieldLookup[item.data.itemType] ?? [];

                                // Collect all URLs for adding as sources
                                const urlSources: string[] = [];

                                for (const field of allowedFields) {
                                        const propertyValue = item.data[field as keyof ZoteroItemData];
                                        if (!propertyValue) continue;

                                        const formattedKey = field.toLowerCase().replace(/\s/g, '');

                                        if (formattedKey === 'key') continue;

                                        const property = properties.find((p) => {
                                                if (!p.text || p.text.length === 0) return false;
                                                const propertyKey = stripPowerupSuffix(p.text[0] as string);
                                                return (
                                                        propertyKey
                                                                .toLowerCase()
                                                                .replace(/\s/g, '') === formattedKey
                                                );
                                        });

                                        if (!property) {
                                                logMessage(
                                                        this.plugin,
                                                        `No matching property for field: ${field}`,
                                                        LogType.Info
                                                );
                                                continue;
                                        }

                                        const propertyType = await property.getPropertyType();
                                        const slotCode = await this.plugin.powerup.getPowerupSlotByCode(
                                                itemTypeCode,
                                                generatePowerupCode(field)
                                        );

                                        if (!slotCode) {
                                                await logMessage(
                                                        this.plugin,
                                                        `Slot code not found for property: ${field}`,
                                                        LogType.Error,
                                                        false
                                                );
                                                continue;
                                        }

//                                         if (isTitleLikeField(field)) {
//                                                 const safeTitle = await this.plugin.richText.parseFromMarkdown(
//                                                         String(propertyValue)
//                                                 );
//                                                 await rem.setText(safeTitle);
//                                                 continue;
//                                         }

                                        if (propertyType === PropertyType.URL) {
                                                const linkID = await this.plugin.rem.createLinkRem(propertyValue, true);
                                                if (!linkID) {
                                                        await logMessage(
                                                                this.plugin,
                                                                `Failed to create link rem for URL: ${propertyValue}`,
                                                                LogType.Error,
                                                                false
                                                        );
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
				if (onProgress) await onProgress();
			}
		}

		// Hydrate properties for collections if needed
		for (const collection of collectionsToHydrate) {
			if (await checkAbortFlag(this.plugin)) return;
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
			if (onProgress) await onProgress();
		}
	}

	/**
	 * Helper to hydrate a Rem with note or annotation content.
	 * If the content is multiline, the first line is used as the Rem text, and the rest as children.
	 * If single line, uses the provided default label as Rem text and the content as children.
	 */
	private async hydrateTextContent(rem: Rem, content: string, defaultLabel: string) {
		const lines = content.split(/\r?\n/);
		if (lines.length > 1) {
			await this.plugin.richText.parseAndInsertHtml(lines[0], rem);
			const rest = lines.slice(1).join('\n');
			const tempRem = await createRem(this.plugin);
			if (tempRem) {
				await tempRem.setParent(rem);
				await this.plugin.richText.parseAndInsertHtml(rest, tempRem);
				const children = await tempRem.getChildrenRem();
				for (const child of children) {
					const subchildren = await child.getChildrenRem();
					if (!child.text || child.text.length === 0) {
						for (const grand of subchildren) {
							await grand.setParent(rem);
						}
						await child.remove();
					} else {
						await child.setParent(rem);
					}
				}
				await tempRem.remove();
			}
		} else {
			await rem.setText([defaultLabel]);
			const tempRem = await createRem(this.plugin);
			if (tempRem) {
				await tempRem.setParent(rem);
				await this.plugin.richText.parseAndInsertHtml(content, tempRem);
				const children = await tempRem.getChildrenRem();
				for (const child of children) {
					const subchildren = await child.getChildrenRem();
					if (!child.text || child.text.length === 0) {
						for (const grand of subchildren) {
							await grand.setParent(rem);
						}
						await child.remove();
					} else {
						await child.setParent(rem);
					}
				}
				await tempRem.remove();
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
				await logMessage(
					this.plugin,
					`Failed to add URL source ${url}: ${String(error)}`,
					LogType.Error,
					false
				);
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
