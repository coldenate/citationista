import {
	AppEvents,
	BuiltInPowerupCodes,
	declareIndexPlugin,
	PowerupSlotCodeMap,
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
		options: [
			{ key: 'APA', value: 'APA', label: 'APA' },
			{
				key: 'MLA',
				value: 'MLA',
				label: 'MLA',
			},
			{
				key: 'Chicago',
				value: 'Chicago',
				label: 'Chicago',
			},
			{
				key: 'Harvard',
				value: 'Harvard',
				label: 'Harvard',
			},
			{
				key: 'Vancouver',
				value: 'Vancouver',
				label: 'Vancouver',
			},
			{
				key: 'IEEE',
				value: 'IEEE',
				label: 'IEEE',
			},
		],
	});

	// powerups

	await plugin.app.registerPowerup(
		'Citation', // human-readable name
		'citation', // powerup code used to uniquely identify the powerup
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
				{
					code: 'citekey',
					name: 'Cite Key',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'containerTitle',
					name: 'Container Title',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'eprint',
					name: 'Eprint',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.CHECKBOX,
				},
				{
					code: 'eprinttype',
					name: 'Eprint Type',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.SINGLE_SELECT,
				},
				{
					code: 'eventPlace',
					name: 'Event Place',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'page',
					name: 'Page',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'publisher',
					name: 'Publisher',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'publisherPlace',
					name: 'Publisher Place',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'titleShort',
					name: 'Title Short',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'URL',
					name: 'URL',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.URL,
				},
				{
					code: 'zoteroSelectURI',
					name: 'Zotero Select URI',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.URL,
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
			// start at the rem the user ran the command at
			let remCursorAt = await plugin.focus.getFocusedRem();
			if (remCursorAt === undefined) {
				let extraString = `We'll then convert that Rem to a document, as per settings. (You can turn this off)`; // only shows if the setting: convertToDocument is true
				await plugin.app.toast(
					`📝 You need to have your cursor in a Rem you'd like to make the document.`
				);
				console.info("Couldn't find a Rem to make a document from.");
				return;
			}
			// then make a children iterator (max depth 10)
			// so we will get the child (remCursorAt.children[0]) and then we will go on 10 times deep into that child
			// then we'll resume the iterator and get the next child (remCursorAt.children[1]) and then we will go on 10 times deep into that child
			// and so on
			if (remCursorAt.children === undefined) {
				await plugin.app.toast('📝 Found no Rem found to search... try broader Rem.');
				return;
			}
			let citations: string[] = [];
			await plugin.app.toast('📝 Searching for sources...');
			await processRem(plugin, remCursorAt, 0, 10);
			const children = await remCursorAt.getChildrenRem();
			console.log(children);
			// await plugin.app.toast(`Copied ${citations.length} citations to clipboard.`);
		},
	});

	pluginPassthrough = plugin;
}

async function onDeactivate(_: ReactRNPlugin) {}

async function processRem(
	plugin: ReactRNPlugin,
	currentRem: Rem,
	currentDepth: number = 0,
	maxDepth: number = 10
) {
	// check if the max depth has been reached
	if (currentDepth > maxDepth) {
		console.info('Max depth reached.');
		return;
	}

	// check if currentRem has children
	if (currentRem.children === undefined) {
		console.info('No children found.');
		return;
	}

	// attempt to pull sources from currentRem
	const sources = await currentRem.getSources();

	if (sources.length !== 0) {
		// TODO: add those citations to the citations array
	}

	// iterate through currentRem's children
	for (let childRem of await currentRem.getChildrenRem()) {
		// check if childRem is undefined
		if (childRem === undefined) {
			console.info('Child Rem is undefined.');
			continue;
		}

		// check if childRem has children, then recurse
		if (childRem.children !== undefined && childRem.children.length > 0) {
			console.info('Child Rem has children.');
			await processRem(plugin, childRem, currentDepth + 1, maxDepth);
		}
	}
}

async function extractCitation(rem: Rem): citationObject | undefined {
	const sources = await rem.getSources();
	console.log(sources);
}

declareIndexPlugin(onActivate, onDeactivate);
