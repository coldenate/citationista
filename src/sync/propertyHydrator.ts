import { filterAsync, PropertyType, RNPlugin } from '@remnote/plugin-sdk';
import { Item, Collection, ChangeSet } from '../types/types';
import { Rem } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import { deriveName, getCode } from '../utils/getCodeName';
import { hasTitleRelatedField as hasTitleRelatedField } from '../services/zoteroSchemaToRemNote';
import { logMessage, LogType } from '../utils/logging';

export class PropertyHydrator {
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
	async hydrateProperties(changes: ChangeSet): Promise<void> {
		const itemsToHydrate = [...changes.newItems, ...changes.updatedItems];
		const collectionsToHydrate = [...changes.newCollections, ...changes.updatedCollections];
		// Hydrate properties for items
		for (const item of itemsToHydrate) {
			const rem = item.rem;
			if (rem) {
				// Tag, Safety, and Hydrate item properties here
				// For example, set custom properties or add content
				// await rem.setCustomProperty('authors', item.data.creators);
				const itemTypeCode = getCode(item.data.itemType);
				const powerupItemType = await this.plugin.powerup.getPowerupByCode(itemTypeCode);
				if (!powerupItemType) {
					console.error('Powerup not found!');
					return;
				}
				await rem.addPowerup(itemTypeCode);

				// await rem.setPowerupProperty(powerupCodes.ZITEM, 'key', [item.key]); we add this when we create it
				await rem.setPowerupProperty(powerupCodes.ZITEM, 'version', [String(item.version)]);

				await rem.setPowerupProperty(powerupCodes.ZITEM, 'fullData', [
					JSON.stringify(item.data),
				]);

				const properties = await filterAsync(await powerupItemType.getChildrenRem(), (c) =>
					c.isProperty()
				);
				for (const property of properties) {
					if (!property.text || property.text.length === 0) continue;

					const propertyKey = deriveName(property.text[0] as string);
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
						getCode(matchingKey)
					);

					if (!slotCode) {
						console.error('Slot code not found for property:', matchingKey);
						continue;
					}

					if (hasTitleRelatedField(matchingKey)) {
						await rem.setText([propertyValue]);
						continue;
					}

					if (propertyType === PropertyType.URL) {
						// TODO: what if there are multiple URLs?
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
						// attempt to add these as Rem's Sources for RemNote Reader Interoperability
						await rem.addSource(linkID);
					} else {
						await rem.setTagPropertyValue(slotCode._id, [propertyValue]);
					}
				}
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
}
