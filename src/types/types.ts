import type { Rem } from '@remnote/plugin-sdk';

/**
 * Detailed data for a Zotero item. This attempts to mirror the fields
 * returned by the Zotero Web API. All fields are optional because not every
 * item type makes use of every field.
 */
export interface ZoteroItemData {
	// biome-ignore lint/suspicious/noExplicitAny: allow indexing for flexibility
	[key: string]: any;
	key: string;
	version: number;
	itemType: ItemType;
	title?: string;
	creators?: Creator[];
	abstractNote?: string;
	publicationTitle?: string;
	volume?: string;
	issue?: string;
	pages?: string;
	date?: string;
	series?: string;
	seriesTitle?: string;
	seriesText?: string;
	journalAbbreviation?: string;
	language?: Language;
	DOI?: string;
	ISSN?: string;
	shortTitle?: string;
	url?: string;
	accessDate?: string;
	archive?: string;
	archiveLocation?: string;
	libraryCatalog?: string;
	callNumber?: string;
	rights?: string;
	extra?: string;
	tags?: Tag[];
	collections?: string[];
	relations?: Relations;
	dateAdded?: string;
	dateModified?: string;
	parentItem?: string;
	linkMode?: LinkMode;
	note?: string;
	contentType?: string;
	charset?: string;
	filename?: string;
	md5?: string;
	mtime?: number;
	websiteTitle?: string;
	websiteType?: string;
	path?: string;
	seriesNumber?: string;
	numberOfVolumes?: string;
	edition?: string;
	place?: string;
	publisher?: string;
	numPages?: string;
	ISBN?: string;
	blogTitle?: string;
	interviewMedium?: string;
	forumTitle?: string;
	postType?: string;
	encyclopediaTitle?: string;
	annotationType?: string;
	annotationText?: string;
	annotationComment?: string;
	annotationColor?: string;
	annotationPageLabel?: string;
	annotationSortIndex?: string;
	annotationPosition?: string;
	genre?: string;
	repository?: string;
	archiveID?: string;
	citationKey?: string;
	dictionaryTitle?: string;
	section?: string;
	videoRecordingFormat?: string;
	studio?: string;
	runningTime?: string;
}

export interface ZoteroLibraryInfo {
	type: 'user' | 'group';
	id: number;
	name: string;
	links?: {
		alternate: {
			href: string;
			type: string;
		};
	};
}

export interface TreeLinkage {
	key: string;
	children?: SyncTreeNode[];
	parent?: SyncTreeNode | null;
}

export interface ZoteroItem extends TreeLinkage {
	version: number;
	library: ZoteroLibraryInfo;
	links: {
		self: {
			href: string;
			type: string;
		};
		alternate: {
			href: string;
			type: string;
		};
	};
	meta: {
		numChildren: number;
	};
	data: ZoteroItemData;
	rem?: Rem | null;
}

export interface ZoteroCollection extends TreeLinkage {
	version: number;
	name: string;
	parentCollection: boolean | string; // if false, top-level
	relations: Record<string, string>;
	rem?: Rem | null;
}

export type SyncTreeNode = ZoteroItem | ZoteroCollection;
/**
 * 1. Initial Sync scenario:
 * This is the Tree structure that will be used to sync the Zotero library with the RemNote library.
 * It will represent first, the Zotero library at a state already in hierarchy.
 * Then, we, in another file, will run through the Zotero library use the SyncTree as a playbook to build out the RemNote library. As we iterate, we will update the SyncTree to contain Rem references to the Rems we create.
 * 2. Syncing scenario:
 * This is the Tree structure that will be used to sync the Zotero library with the RemNote library.
 * We will build out two SyncTrees from the RemNote library and Zotero Library.
 * We will then compare the two trees and determine the changes that need to be made to the RemNote library to bring it up to date with the Zotero library.
 * We will then apply the changes to the RemNote library.
 */

export const isCollection = (n: SyncTreeNode): n is ZoteroCollection => {
	return (n as ZoteroCollection).parentCollection !== undefined;
};

// remPlanner.ts ──────────────────────────────────────────────
export type OpType = 'create' | 'update' | 'move' | 'delete';

export interface RemOpBase {
	type: OpType;
	key: string; // Zotero key
}

/** create – parent→child order matters */
export interface CreateOp extends RemOpBase {
	type: 'create';
	node: SyncTreeNode; // full Zotero+linkage payload
	parentKey: string | null; // where to attach (null = root)
}

/** update – text / props only, no structural movement */
export interface UpdateOp extends RemOpBase {
	type: 'update';
	node: SyncTreeNode; // remote (authoritative) version
}

/** move – structure only, no content change */
export interface MoveOp extends RemOpBase {
	type: 'move';
	newParentKey: string | null;
}

/** delete – bottom-up order is enforced later */
export interface DeleteOp extends RemOpBase {
	type: 'delete';
	isCollection: boolean; // helps executor decide recurse-or-simple remove
}

export type RemOperation = CreateOp | UpdateOp | MoveOp | DeleteOp;

// /**
//  * Raw item object returned directly from the Zotero API.
//  */
// export interface ZoteroItemResponseOld {
// 	key: string;
// 	version: number;
// 	message?: string;
// 	rem?: Record<string, unknown> | null;
// 	data?: Partial<ZoteroItemData>;
// 	relations?: Relations;
// }

// /**
//  * Raw collection object returned directly from the Zotero API.
//  */
// export interface ZoteroCollectionResponseOld {
// 	key: string;
// 	version: number;
// 	name?: string;
// 	parentCollection?: string | false;
// 	rem?: Record<string, unknown> | null;
// 	relations?: Record<string, string>;
// }

export interface Creator {
	creatorType: CreatorType;
	firstName?: string;
	lastName?: string;
	name?: string;
}

export interface Tag {
	tag: string;
	type?: number;
}

export interface Relations {
	'dc:replaces'?: string[] | string;
	'dc:relation'?: string;
}

export enum ItemType {
	Annotation = 'annotation',
	Attachment = 'attachment',
	BlogPost = 'blogPost',
	Book = 'book',
	DictionaryEntry = 'dictionaryEntry',
	EncyclopediaArticle = 'encyclopediaArticle',
	ForumPost = 'forumPost',
	Interview = 'interview',
	JournalArticle = 'journalArticle',
	NewspaperArticle = 'newspaperArticle',
	Note = 'note',
	Preprint = 'preprint',
	VideoRecording = 'videoRecording',
	Webpage = 'webpage',
}

export enum CreatorType {
	Author = 'author',
	Director = 'director',
	Interviewee = 'interviewee',
}

export enum Language {
	Empty = '',
	En = 'en',
	EnGB = 'en-GB',
	EnUS = 'en-US',
	Eng = 'eng',
	English = 'English',
	LanguageEnGB = 'en-gb',
}

export enum LinkMode {
	ImportedURL = 'imported_url',
	LinkedFile = 'linked_file',
	LinkedURL = 'linked_url',
}

/**
 * Minimal user object returned from the Zotero API when fetching the current user.
 */
export interface ZoteroUserResponse {
	data?: {
		profileName?: string;
		username?: string;
	};
}

/**
 * Minimal group object returned when listing user groups via the Zotero API.
 */
export interface ZoteroGroupListItem {
	id?: number | string;
	name?: string;
	data?: {
		id?: number | string;
		name?: string;
	};
}

// Add missing type definitions
export type Item = ZoteroItem;
export type Collection = ZoteroCollection;

export interface ChangeSet {
	newItems: Item[];
	updatedItems: Item[];
	deletedItems: Item[];
	movedItems: Item[];
	newCollections: Collection[];
	updatedCollections: Collection[];
	deletedCollections: Collection[];
	movedCollections: Collection[];
}

export interface RemNode {
	remId: string;
	zoteroId: string;
	zoteroParentId?: string;
	rem: Rem;
}

export interface ZoteroItemResponse {
	key: string;
	version: number;
	message?: string;
	data?: Partial<ZoteroItemData>;
	relations?: Relations;
}

export interface ZoteroCollectionResponse {
	key: string;
	version: number;
	name?: string;
	parentCollection?: string | false;
	relations?: Record<string, string>;
}
