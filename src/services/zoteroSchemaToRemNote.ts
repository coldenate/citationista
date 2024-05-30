import { PropertyLocation, PropertyType } from '@remnote/plugin-sdk';
import { getCode } from '../utils/getCodeName';

type Field = {
	field: string;
	baseField?: string;
};

type CreatorType = {
	creatorType: string;
	primary?: boolean;
};

export type ItemType = {
	itemType: string;
	fields: Field[];
	creatorTypes: CreatorType[];
};

function getPropertyType(field: string): PropertyType {
	if (field.includes('date') || field.includes('Date')) {
		return PropertyType.DATE;
	} else if (field.includes('url') || field.includes('URL')) {
		return PropertyType.URL;
	} else if (
		field.includes('number') ||
		field.includes('Number') ||
		field.includes('volume') ||
		field.includes('pages')
	) {
		return PropertyType.NUMBER;
	} else if (
		field.includes('title') ||
		field.includes('Title') ||
		field.includes('name') ||
		field.includes('Name')
	) {
		return PropertyType.TITLE;
	} else if (field.includes('abstractNote')) {
		return PropertyType.TEXT;
	} else {
		return PropertyType.TEXT;
	}
}

export function registerItemPowerups(itemTypes: ItemType[]) {
	const powerups = [];

	for (const itemType of itemTypes) {
		const slots = itemType.fields.map((field) => ({
			code: getCode(field.field),
			name: field.field.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
			onlyProgrammaticModifying: false,
			hidden: false,
			propertyType: getPropertyType(field.field),
			propertyLocation: PropertyLocation.ONLY_IN_TABLE,
		}));

		const powerup = {
			name: itemType.itemType.charAt(0).toUpperCase() + itemType.itemType.slice(1),
			code: getCode(itemType.itemType),
			description: `Powerup for ${itemType.itemType}`,
			options: {
				slots: slots,
			},
		};

		powerups.push(powerup);
	}

	return powerups;
}
