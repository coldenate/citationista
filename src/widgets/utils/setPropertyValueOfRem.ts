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
