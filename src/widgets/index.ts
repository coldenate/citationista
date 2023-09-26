import {
	AppEvents,
	BuiltInPowerupCodes,
	declareIndexPlugin,
	PropertyType,
	ReactRNPlugin,
	Rem,
	RichText,
	RichTextNamespace,
	SelectSourceType,
	WidgetLocation,
} from '@remnote/plugin-sdk';

let pluginPassthrough: ReactRNPlugin;

async function onActivate(plugin: ReactRNPlugin) {
	// settings

	await plugin.settings.registerDropdownSetting({
		id: 'export-citations-format',
		title: 'Export Citations Format',
		description: 'The format used when exporting citations.',
		defaultValue: 'APA',
		options: [{ key: 'APA', value: 'APA', label: 'APA' }],
	});

	// powerups

	await plugin.app.registerPowerup(
		'Citation', // human-readable name
		'ctn', // powerup code used to uniquely identify the powerup
		'A citation object holding certain citation metadata for export. Used only for individual papers.', // description
		{
			slots: [
				{
					code: 'message',
					name: 'Message',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'title',
					name: 'Title',
					onlyProgrammaticModifying: false,
					hidden: false,
				},
				{
					code: 'authors',
					name: 'Author(s)',
					onlyProgrammaticModifying: false,
					hidden: false,
				},
				{
					code: 'date',
					name: 'Date',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
				},
				{
					code: 'journal',
					name: 'Journal/Source',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'volume',
					name: 'Volume',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.NUMBER,
				},
				{
					code: 'issue',
					name: 'Issue',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.NUMBER,
				},
				{
					code: 'pages',
					name: 'Page Numbers',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'doi',
					name: 'DOI (Digital Object Identifier)',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'url',
					name: 'URL',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'abstract',
					name: 'Abstract',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'keywords',
					name: 'Keywords',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'accessDate',
					name: 'Access Date',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
				},
			],
		}
	);

	// commands

	await plugin.app.registerCommand({
		name: 'export citations',
		description:
			'Exports all citations of this Rem to clipboard. Searches through all children of this Rem. Uses defined format in settings.',
		id: 'export-citations',
		quickCode: 'cite',
		icon: '📑',
		keywords: 'citation, export',
		action: async () => {
			let citations: string[] = [];
			await plugin.app.toast(`Copied ${citations.length} citations to clipboard.`);
		},
	});

	pluginPassthrough = plugin;
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
