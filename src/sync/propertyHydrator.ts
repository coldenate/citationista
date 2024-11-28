import { filterAsync, PropertyType, RNPlugin, SetRemType } from '@remnote/plugin-sdk';
import { Item, Collection, ChangeSet, RemNode } from '../types/types';
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
