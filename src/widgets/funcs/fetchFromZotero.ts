import { RNPlugin } from '@remnote/plugin-sdk';
import { callZoteroConnection } from '../utils/callZoteroConnection';

export async function getAllZoteroItems(plugin: RNPlugin) {
	// get all items from Zotero
	const zoteroItems = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroItemsResponse = await zoteroAPIConnection.items().get();

	for (const item of zoteroItemsResponse.raw) {
		// example of item
		// 		 {
		//     key: 'C72HFD6U',
		//     version: 17,
		//     library: {
		//       type: 'user',
		//       id: 11699886,
		//       name: 'Nathan Solis',
		//       links: { alternate: { href: 'https://www.zotero.org/coldenate', type: 'text/html' } }
		//     },
		//     links: {
		//       self: { href: 'https://api.zotero.org/users/11699886/items/C72HFD6U', type: 'application/json' },
		//       alternate: { href: 'https://www.zotero.org/coldenate/items/C72HFD6U', type: 'text/html' },
		//       attachment: {
		//         href: 'https://api.zotero.org/users/11699886/items/FS69FCIW',
		//         type: 'application/json',
		//         attachmentType: 'application/pdf',
		//         attachmentSize: 733670
		//       }
		//     },
		//     meta: { creatorSummary: 'Marzullo', parsedDate: '2017-06-15', numChildren: 2 },
		//     data: {
		//       key: 'C72HFD6U',
		//       version: 17,
		//       itemType: 'journalArticle',
		//       title: 'The Missing Manuscript of Dr. Jose Delgado’s Radio Controlled Bulls',
		//       creators: [ { creatorType: 'author', firstName: 'Timothy C.', lastName: 'Marzullo' } ],
		//       abstractNote:
		//         'Neuroscience systems level courses teach: 1) the role of neuroanatomical structures of the brain for perception, movement, and cognition; 2) methods to manipulate and study the brain including lesions, electrophysiological recordings, microstimulation, optogenetics, and pharmacology; 3) proper interpretation of behavioral data to deduce brain circuit operation; and 4) the similarities, differences, and ethics of animal models and their relation to human physiology. These four topics come together quite dramatically in Dr. Jose Delgado’s 1960s famous experiments on the neural correlates of aggression in which he stopped bulls in mid-charge by electrically stimulating basal ganglia and thalamic structures. Technical documentation on these experiments is famously difficult to find. Here I translate and discuss a Spanish language article written by Dr. Delgado in 1981 for an encyclopedia on bull fighting published in Madrid. Here Dr. Delgado appears to give the most complete explanation of his experiments on microstimulation of bovine brains. Dr. Delgado’s motivations, methods, and his interpretation of the bull experiments are summarized, as well as some accompanying information from his 1970 English language book: “Physical Control of the Mind.” This review of Dr. Delgado’s written work on the bull experiments can provide a resource to educators and students who desire to learn more about and interpret the attention-calling experiments that Dr. Delgado did on a ranch in Andalucía over 50 years ago.',
		//       publicationTitle: 'Journal of Undergraduate Neuroscience Education',
		//       volume: '15',
		//       issue: '2',
		//       pages: 'R29-R35',
		//       date: '2017-6-15',
		//       series: '',
		//       seriesTitle: '',
		//       seriesText: '',
		//       journalAbbreviation: 'J Undergrad Neurosci Educ',
		//       language: '',
		//       DOI: '',
		//       ISSN: '1544-2896',
		//       shortTitle: '',
		//       url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5480854/',
		//       accessDate: '2023-12-01T01:44:00Z',
		//       archive: '',
		//       archiveLocation: '',
		//       libraryCatalog: 'PubMed Central',
		//       callNumber: '',
		//       rights: '',
		//       extra: 'PMID: 28690447\nPMCID: PMC5480854',
		//       tags: [],
		//       collections: [ 'K4YCBJ26' ],
		//       relations: {},
		//       dateAdded: '2023-12-01T01:44:00Z',
		//       dateModified: '2023-12-01T01:44:00Z'
		//     }
		//   }
		zoteroItems.push(item);
	}
	return zoteroItems;
}

async function getItemFromZotero(plugin: RNPlugin, itemKey: string) {
	// get individual item from Zotero via key (I don't even think this is possible)
}
// function: get all collections from zotero

export async function getAllZoteroCollections(plugin: RNPlugin) {
	const zoteroCollections = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroCollectionsResponse = await zoteroAPIConnection.collections().get();
	const zoteroCollectionsData = zoteroCollectionsResponse.getData();
	for (const collection of zoteroCollectionsData) {
		zoteroCollections.push(collection);
	}
	return zoteroCollections;
}
