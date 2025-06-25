import type { Rem } from '@remnote/plugin-sdk';

/**
 * Detailed data for a Zotero item. This attempts to mirror the fields
 * returned by the Zotero Web API. All fields are optional because not every
 * item type makes use of every field.
 */
export interface ZoteroItemData {
	[key: string]: any; // allow indexing for unknown fields
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

export type Item = {
	version: number;
	message?: string;
	key: string;
	/**
	 * The Rem corresponding to this Zotero item. When initially fetched from
	 * the API this will be `null` and later populated once the tree builder
	 * creates or locates the Rem.
	 */
	rem: Rem | null;
	data: ZoteroItemData;
};

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

export type Collection = {
	/** Rem corresponding to this collection. May be `null` until created */
	rem: Rem | null;
	key: string;
	version: number;
	name: string;
	parentCollection: string;
	relations: Record<string, string>; // TODO: Implement Relations (if needed?)
};

export interface RemNode {
	remId: string;
	zoteroId: string;
	zoteroParentId: string | string[] | null;
	rem: Rem;
}
