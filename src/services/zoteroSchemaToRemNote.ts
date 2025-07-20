/** Helpers for generating and registering RemNote power‑ups from Zotero item types. */
import {
	type PowerupCode,
	PropertyLocation,
	PropertyType,
	type RegisterPowerupOptions,
} from '@remnote/plugin-sdk';
import type { ZoteroItemData } from '../types/types';
import { generatePowerupCode, generatePowerupName } from '../utils/getCodeName';

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

export function isTitleLikeField(field: string): boolean {
	return (
		field.includes('title') ||
		field.includes('Title') ||
		field.includes('name') ||
		field.includes('Name')
	);
}

export function getItemTitle(data: ZoteroItemData): string | undefined {
	return data.title ?? data.shortTitle ?? (data as { name?: string }).name;
}

function inferPropertyType(field: string): PropertyType {
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
		return PropertyType.TEXT;
	} else if (field.includes('abstractNote')) {
		return PropertyType.TEXT;
	} else {
		return PropertyType.TEXT;
	}
}

type RegisterPowerup = {
	name: string;
	code: PowerupCode;
	description: string;
	options: RegisterPowerupOptions;
};

export function registerItemPowerups(itemTypes: ItemType[]) {
	const powerups = [];

	for (const itemType of itemTypes) {
		const powerup: RegisterPowerup = {
			name: generatePowerupName(
				itemType.itemType.charAt(0).toUpperCase() + itemType.itemType.slice(1)
			),
			code: generatePowerupCode(itemType.itemType),
			description: `Powerup for ${itemType.itemType}`,
			options: {
				slots: itemType.fields.map((field) => ({
					code: generatePowerupCode(field.field),
					name: field.field
						.replace(/([A-Z])/g, ' $1')
						.replace(/^./, (str) => str.toUpperCase()),
					onlyProgrammaticModifying: false,
					hidden:
						field.field === 'title' ||
						field.field === 'Title' ||
						field.field === 'name' ||
						field.field === 'Name',
					propertyType: inferPropertyType(field.field),
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
					defaultEnumValue: undefined,
					dontPublishToSharedArticle: undefined,
					enumValues: undefined,
					selectSourceType: undefined,
				})),
			},
		};

		powerups.push(powerup);
	}

	return powerups;
}
