import { RNPlugin, Rem } from '@remnote/plugin-sdk';

async function setPropertyValueOfRem(
	plugin: RNPlugin,
	powerupCode: string,
	propertyCode: string,
	rem: Rem,
	value: any
) {
	const property = await plugin.powerup.getPowerupSlotByCode(powerupCode, propertyCode);
	if (property === undefined) {
		console.error(`Property ${propertyCode} on ${powerupCode} not found.`);
		return;
	}
	return await rem.setTagPropertyValue(property!._id, value);
}
export async function getCollectionPropertybyCode(plugin: RNPlugin, code: string) {
	const zoteroCollectionPowerupSlot = await plugin.powerup.getPowerupSlotByCode(
		'collection', // TODO: update this to import from a global constant
		code
	);
	const zoteroCollectionPowerupSlotId = zoteroCollectionPowerupSlot?._id ?? '';
	return zoteroCollectionPowerupSlotId;
}
export async function getItemPropertyByCode(plugin: RNPlugin, code: string): Promise<string> {
	const zoteroItemPowerupSlot = await plugin.powerup.getPowerupSlotByCode(
		'zitem', // TODO: update this to import from a global constant
		code
	);
	const zoteroItemPowerupSlotId = zoteroItemPowerupSlot?._id ?? '';
	return zoteroItemPowerupSlotId;
}
