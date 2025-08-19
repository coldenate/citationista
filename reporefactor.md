Zotero-RemNote Sync Pipeline Analysis (syncing-beta-3 Branch)
Overview of the Current Sync Implementation

The Zotero-RemNote Connector aims to sync Zotero libraries with RemNote. In the syncing-beta-3 branch, the sync pipeline involves several components working together:

ZoteroSyncManager – orchestrates the overall sync process. It handles multi-library vs. single-library sync modes, progress tracking, and abort checks. The syncLibrary() method fetches Zotero data, compares it with last synced data, merges changes, and then applies updates to RemNote
GitHub
GitHub
.

ChangeDetector – compares the previous sync state (a shadow copy of items/collections) with the current Zotero data to identify what changed. It produces a ChangeSet listing new, updated, deleted, and moved items/collections
GitHub
GitHub
.

Merge Logic (mergeUpdatedItems & threeWayMerge) – for each item flagged as updated on both sides, the code merges Zotero’s data with any local modifications. It performs a three-way merge between the Zotero data, the local RemNote data (from last sync), and the previous baseline, to resolve conflicts automatically
GitHub
GitHub
.

TreeBuilder – responsible for constructing and updating the RemNote knowledge base tree. It builds a node cache mapping Zotero item and collection IDs to existing RemNote rems, then creates, updates, deletes, or moves rems according to the ChangeSet
GitHub
GitHub
. In essence, TreeBuilder.applyChanges() applies the structural changes (adding/removing items and collections, nesting them under the proper parents)
GitHub
.

ZoteroPropertyHydrator – after structural changes, this class “hydrates” each new or updated Rem with detailed content and metadata. It sets the Rem’s text (e.g. item title or note content), adds relevant power-ups (like Item Type or Collection tags), and fills in custom power-up properties (authors, DOI, etc.)
GitHub
GitHub
.

Plugin Storage – the last synced data (shadow copies of Zotero items/collections) is stored in RemNote’s plugin storage (zoteroDataMap). After each successful sync, the current Zotero data (without the Rem references) replaces the old shadow so that next sync can detect changes
GitHub
GitHub
.

Together, these components facilitate a one-way import from Zotero to RemNote with some conflict resolution logic. Below, we examine how the sync flow works and identify areas to improve clarity, modularity, and truly bidirectional behavior.

Sync Process: Tree Construction, Comparison, and Hydration Flow

The sync pipeline proceeds in clear phases. Breaking it down step-by-step:

Preparation and Locking: When a sync starts, ZoteroSyncManager checks if a sync is already in progress and acquires a lock to prevent overlap
GitHub
. It also resets any stale state from a previously aborted sync (clearing the syncing flag, etc.)
GitHub
. If “Sync Multiple Libraries” is enabled, it iterates through each accessible library sequentially
GitHub
GitHub
. For each library (or the single selected library), it calls syncLibrary(library).

Ensure Base Rem Structure: At the start of syncing a library, the code ensures that necessary RemNote nodes exist to represent the Zotero library hierarchy. This involves creating (if not present) a top-level Zotero Rem and a child Rem for the specific library (e.g. “My Library” or group library), as well as an "Unfiled Items" Rem where items with no collection will reside
GitHub
. These are created via helpers like ensureZoteroLibraryRemExists and ensureUnfiledItemsRemExists. This guarantees there’s a place in RemNote to attach incoming collections and items.

Fetching Current Zotero Data: The plugin then fetches all collections and items from the Zotero API for that library. This is done via ZoteroAPI.fetchLibraryData(), which internally gathers all items (in batches of 100) and all collections, converting them into the internal Item and Collection structures
GitHub
GitHub
. Each Item includes a nested data object with all Zotero fields, and each is initialized with rem: null (since we haven’t linked them to RemNote yet)
GitHub
GitHub
. The fetched result is a structure like { items: Item[], collections: Collection[] }.

Loading the Previous Sync State: The plugin retrieves the last saved Zotero data from plugin storage (zoteroDataMap). This “shadow” data represents what was last synced to RemNote. It’s used as the baseline for change detection. The code constructs prevData by deep-cloning the stored data and ensuring each entry has rem: null (so it’s comparable to the new fetch)
GitHub
GitHub
. If no shadow exists (first sync), prevData will be empty arrays.

Building the Rem Node Cache: Before comparing data, the TreeBuilder is initialized and builds a node cache of the current RemNote state. This cache maps each Zotero object’s key to its corresponding Rem in the knowledge base
GitHub
GitHub
. The initializeNodeCache() method scans RemNote for all rems tagged with the Zotero Item or Collection power-ups
GitHub
. It filters out the power-up definition rems and then, for each real item/collection rem found, records:

The Zotero key (zoteroId) stored in that rem’s key property.

The Zotero parent ID (zoteroParentId) stored in the collection or parentCollection property (this indicates the parent collection or parent item in Zotero).

The Rem’s own ID and Rem object reference
GitHub
GitHub
.

This cache allows quick lookup of any Rem corresponding to a given Zotero item or collection. It’s essential for identifying which Zotero entries already exist in RemNote and for efficiently updating or reparenting them. By the end of this step, the code knows exactly which Zotero items/collections have a representation in RemNote (and where).

Detecting Changes (Add/Update/Delete/Move): Now the plugin compares the previous state vs. current Zotero data using ChangeDetector.detectChanges():

New items/collections: Any Zotero key present in currentData but not in prevData is flagged as new (to be created in RemNote)
GitHub
GitHub
.

Deleted items/collections: Any key that existed before but is missing in Zotero now is marked as deleted (to be removed from RemNote)
GitHub
GitHub
.

Updated items: If an item exists in both but its data has changed (the code does a JSON stringify comparison of the Zotero data object), it’s marked updated
GitHub
. This would catch changes like title edits, added tags, modified metadata, etc., as well as changes in the item’s version number.

Moved items: Zotero items can belong to collections; if an item’s collection membership differs from last time, it’s marked as “moved”
GitHub
. The detector specifically compares the sorted list of collection IDs (and parent item, for attachments/notes) from prevData vs currentData. A difference (e.g. an item was added to a new collection or removed from one) sets the movedItems flag. Similarly, collections whose parentCollection field changed (collection moved under a different parent) are marked as movedCollections
GitHub
.

Updated collections: If a collection exists but some property changed (most likely the name, since parent changes are handled separately), it’s added to updatedCollections
GitHub
.

The result is a ChangeSet object containing arrays of newItems, updatedItems, deletedItems, movedItems, and likewise for collections
GitHub
. One nuance: if this is the first sync (no previous data), the code treats all current Zotero entries as new by overwriting the change lists (so everything will be created)
GitHub
.

After detection, the code performs an extra check against the node cache to catch any Zotero items that are “missing” in RemNote. For example, if an item wasn’t truly new (it existed in previous data) but the corresponding Rem was deleted or never created, the item won’t be in the node cache. The sync code treats those as new to ensure they get (re)created in RemNote
GitHub
GitHub
. This means even if a user manually removed a synced Rem in RemNote, the next sync will consider the Zotero item absent in the KB and add it back (since it’s still in Zotero).

Merging Updates (Conflict Resolution): For each item marked as updated, the plugin performs an automated three-way merge to reconcile conflicts between Zotero and RemNote:

It looks up the item’s shadow copy from prevData (the baseline) and the current RemNote local data. The local data is fetched from the Rem’s content stored during the last sync – specifically, the plugin stores a JSON string of the item’s full Zotero data in a hidden “fullData” power-up property on each item Rem
GitHub
. This property acts as the last known local version.

Using threeWayMerge(localData, remoteData, baseData), each field of the item is merged:

Core fields (key bibliographic info like title, authors, publication, dates, identifiers, etc.) always prefer the Zotero value. The code maintains a list of these core fields (e.g. title, publisher, date, DOI, etc.) and if a field is in this list, the Zotero side “wins” any conflict
GitHub
GitHub
. This ensures Zotero remains the source of truth for critical reference data.

Child content fields (notably notes and tags, which are arrays) are merged by union. The mergeChildContent() helper combines arrays from both sides, avoiding duplicates
GitHub
GitHub
. For example, if a user added a tag in RemNote and another tag was added in Zotero, both tags will appear in the merged result. Similarly, notes (which Zotero represents as separate items or as annotation entries) are merged so no edits are lost
GitHub
.

Other fields (non-core, non-array) default to “keep local unless Zotero changed it”. If the Zotero value is unchanged from the base, the local value is kept; but if Zotero’s value differs from the base, the remote change is applied
GitHub
. In effect, this means Zotero changes propagate, but if the user made a change in RemNote to a field that Zotero did not touch, that change will persist.

The merged result replaces the item’s data in the ChangeSet for further processing
GitHub
. Notably, the code also attaches the Rem reference to the updatedItem at this point (so that subsequent steps know which Rem to update)
GitHub
GitHub
.

Example: Suppose an item’s title was edited in RemNote (local) and its abstract was edited in Zotero (remote). In the merge:

Title is a core field, so Zotero’s title wins (the user’s local title change would be overridden by Zotero’s value)
GitHub
GitHub
.

Abstract is not a core field; since Zotero’s abstract changed (remote != base), the Zotero change is taken. Any local change to the abstract (if it existed) would be lost unless Zotero’s copy was unchanged.

Tags are merged: any new tags from either side appear in the combined list
GitHub
.
This three-way merge approach is a form of automated conflict resolution – it doesn’t prompt the user, but applies deterministic rules to resolve discrepancies.

Applying Changes to the RemNote KB: With a finalized ChangeSet (post-merge), the TreeBuilder.applyChanges() method updates the RemNote knowledge base to reflect these changes
GitHub
GitHub
. It breaks down the operations by category:

Creating new collections: For each new Zotero collection, a new Rem is created (via createRem) under the library’s hierarchy
GitHub
. The Rem is tagged as a Collection (power-up added) and its Zotero key stored as a property
GitHub
. The new Rem’s pointer is saved in the collection.rem field so that subsequent item placement knows this Rem
GitHub
. The node cache is also updated immediately with the new collection Rem
GitHub
.

Updating collections: For collections marked updated (e.g. name changed), the code finds the existing Rem via the cache and updates its text to the new name
GitHub
. If the collection’s parent changed (handled separately as movedCollections), that will be addressed in the move step. If the Rem for an “updated” collection isn’t found (unexpected, perhaps if it wasn’t created earlier), the code logs a warning and falls back to creating it fresh
GitHub
.

Deleting collections: Any collection that was removed in Zotero results in the corresponding Rem being removed from RemNote
GitHub
. The code uses rem.remove() and deletes the entry from the node cache. Deletions are batched with Promise.all for efficiency
GitHub
.

Moving collections: After create/update/delete, the moveCollections step runs. It iterates through collections that are new, moved, or updated
GitHub
 and sets their Rem parent to reflect the Zotero hierarchy
GitHub
. If a collection now has a parent (nested collection), it finds the parent’s Rem in the cache and uses rem.setParent(parent.rem) to nest it
GitHub
. If a collection’s parent is null (top-level in Zotero), the code attaches it under the library’s main Rem page as a fallback
GitHub
GitHub
. By the end of this, the collection structure in RemNote mirrors Zotero’s collection tree.

Creating new items: For each new Zotero item, a Rem is created via createRem
GitHub
. By default, createRem in this plugin will place the new Rem under the library’s “Unfiled Items” placeholder (it ensures the Unfiled Items rem exists and sets the new Rem’s parent to that by default)
GitHub
GitHub
. Once created, the item Rem is tagged with the Zotero Item power-up (ZITEM) and also tagged with a specific item-type power-up (e.g., “Book”, “Journal Article”) if one exists for that type
GitHub
. The Zotero key is stored as a property on the Rem to link it to Zotero
GitHub
. The code does minimal content here – for instance, it does not set the title or other fields yet (that happens in the hydration phase). It does capture the initial parent relationship in the cache: the item’s zoteroParentId is recorded as either its parent item or the first collection it’s in (or null if none)
GitHub
. This helps later with move logic. If the Rem couldn’t be created (rare, but if createRem returns undefined), it logs an error and skips that item
GitHub
.

Updating items: For each updated item (post-merge), if the Rem exists, the code updates its text to the (merged) title using rem.setText(...)
GitHub
. It uses RemNote’s Markdown parser to format the title safely (so any Markdown in the title is handled)
GitHub
. It also updates the cached parent ID for the item if its Zotero parent or collections changed
GitHub
. If an “updated” item’s Rem is missing (perhaps it was never created or was deleted by the user), the code logs info and calls createItems([item]) to create it anew
GitHub
. This way, no updated item is skipped – if it’s not there, they treat it like new.

Deleting items: Items deleted in Zotero trigger removal of the corresponding Rem in RemNote. Similar to collections, the code calls rem.remove() for each and deletes them from the cache
GitHub
. These removals are done concurrently via Promise.all
GitHub
.

Moving items: Finally, the plugin handles reparenting items to match Zotero collections. This is the most intricate part because Zotero items can belong to multiple collections. The moveItems() function is given all items that might need repositioning – i.e. all new, moved, or updated items (since new items start under Unfiled, and updated items might have gained/lost collections)
GitHub
GitHub
. For each item, it determines the set of parent Rems it should have:

If the item has a parentItem (e.g. a note or attachment belonging to a parent reference), that parent’s Rem is included as one potential parent
GitHub
.

For each collection ID in the item’s Zotero collections array, it looks up the collection’s Rem in the cache and includes it if found
GitHub
.
Depending on how many parent Rems are found:

No parents found: This means the item isn’t in any collection (and has no parent item), or its collections weren’t created/found. The item is considered “unfiled.” The code ensures it stays under the Unfiled Items Rem in the library (it sets the parent to the unfiled Rem)
GitHub
GitHub
. (If the item was just created, it’s already under Unfiled by default, so this is essentially a safeguard to keep it there if it had been moved elsewhere before.)

One or more parents: If at least one parent Rem is identified, the item’s Rem is moved to the first parent in the list (this becomes the primary location of the Rem)
GitHub
. If there are additional parent collections beyond the first:

In “Portal” mode (default), the item is kept as a single Rem (under the first parent), and for each extra parent, a Portal is created in that collection which points to the original Rem
GitHub
GitHub
. This uses RemNote’s portal feature to effectively have the item appear in multiple places. The code creates a portal Rem and then addToPortal to insert the item into it, thus linking the same Rem into another collection context
GitHub
.

In “Reference” mode, the plugin will create separate reference Rems in the other collections. It leaves the original Rem under the first collection, and for each additional collection, it creates a new empty Rem and sets its content as a Rem Reference to the original item
GitHub
GitHub
. (In the code, it does emptyRem.setText([{ i: 'q', _id: remNode.rem._id }]) which is a low-level way to create a Rem reference to the original item’s Rem
GitHub
.) This approach means changes to one instance won’t reflect on the others (unlike portals), treating each collection entry as a distinct reference Rem.

The multiple-parent behavior is configured by the user setting multiple-colections-behavior (note the misspelling in code) as “portal” or “reference”
GitHub
GitHub
. The portal approach is more dynamic (one source of truth), whereas the reference approach duplicates the item (which might be desirable if the user wants different annotations per context).
After this step, every Zotero item Rem is placed under the appropriate collection Rem(s) or in Unfiled Items, matching the Zotero library structure. The nodeCache is also updated for moved items (it sets remNode.zoteroParentId to the new primary parent’s ID)
GitHub
.

Hydrating Item & Collection Properties: At this stage, the structural sync is complete – all items and collections exist in RemNote with correct hierarchy. What remains is to fill in the content and metadata for newly created or updated entries. This is handled by ZoteroPropertyHydrator.hydrateItemAndCollectionProperties() if the user hasn’t enabled “Simple Syncing Mode”
GitHub
GitHub
. Hydration does the following:

For each new or updated item: The hydrator retrieves the Rem (set earlier in the change objects) and performs a series of updates
GitHub
GitHub
:

Adds the item type power-up if not already present (e.g. if the item is a Journal Article, ensure the “Journal Article” power-up is tagged)
GitHub
. (There is slight overlap here with the creation step, which also attempted to add the item type power-up; see notes in the next section about duplication.)

If the item is a Zotero Note or Annotation, the text content is inserted as the Rem’s children rather than as a simple title. The hydrateTextContent helper handles multi-line note text: the first line becomes the Rem’s own text, and the remaining lines are added as child rems (preserving line breaks)
GitHub
GitHub
. For single-line notes, it uses a default label (“Note” or “Annotation”) as the Rem’s title and puts the full note text as a child Rem
GitHub
. This preserves the rich content of Zotero notes in RemNote format.

For regular (non-note) items, it sets the Rem’s text to the item’s title. Before setting, it sanitizes/format the title via plugin.richText.parseFromMarkdown to handle any special characters or Markdown formatting
GitHub
. After this, the Rem’s name in RemNote should match the item’s title in Zotero.

It sets certain power-up properties on the item’s Rem:

The Zotero version number is stored (Power-up: Zotero Item, property: version)
GitHub
. This can be used to detect if an item changed in Zotero since last sync.

The full data JSON from Zotero is stored (Power-up: Zotero Item, property: fullData)
GitHub
. This was used earlier as the local copy for merging; now it’s updated with the latest data (post-merge) so that next sync has an up-to-date baseline. Essentially, each Rem carries the last synced Zotero data within it.

The hydrator then iterates over all Zotero fields that have corresponding custom properties under the item’s type power-up. It looks at the item’s data for each allowed field (as defined by a schema for that item type)
GitHub
GitHub
. If the field has a value, it finds the matching property Rem (child of the item type power-up in the RemNote hierarchy) and sets the value:

If the property type is URL, it creates a Link Rem (a RemNote object representing an external URL) and uses setTagPropertyValue to set a hyperlink property
GitHub
GitHub
. It also accumulates these URLs to add them as sources (so the RemNote document is sourced by the original URL, DOI link, etc.)
GitHub
GitHub
.

For other types (text, number, etc.), it sets the property value directly via setTagPropertyValue
GitHub
GitHub
.

If a Zotero field is present in the data but no corresponding property slot exists in RemNote’s schema, it logs a message that the field is ignored
GitHub
. This ensures unrecognized fields don’t silently fail.

After setting all fields, if any URLs were collected (from URL or DOI fields), they are added as source URLs to the RemNote Rem using rem.addSource(linkRem)
GitHub
. This leverages RemNote’s “source” feature to attach the original web links, which is useful for the RemNote Reader to open PDFs or web pages.

The hydrator calls onProgress() after each item if provided, to update progress UI
GitHub
GitHub
.

For each new or updated collection: The process is simpler:

Ensure the Rem is tagged with the Collection power-up (should already be, but this call ensures idempotency)
GitHub
.

Set the Rem’s text to the collection name (if not already set during creation/update)
GitHub
.

Set the key property on the Collection power-up to store the Zotero collection key, and the version property to store the version number
GitHub
. It also redundantly sets a name property (which might not be strictly needed since the Rem’s own text is the name)
GitHub
.

Progress is ticked for each collection as well
GitHub
GitHub
.
After hydration, the RemNote side now has all the detailed info: the titles, content for notes, and metadata fields reflect Zotero’s data, and each Rem is annotated with power-ups for traceability (item types, collection tags, etc.).

Finalizing Sync: Once changes are applied and hydrated, the plugin updates its state:

It saves the current data as the new shadow copy in storage (zoteroDataMap) for next time
GitHub
GitHub
. Notably, before saving, it strips out the live Rem references from the data: the code maps each item/collection to a plain object excluding the rem field (and other non-serializable bits) so that only Zotero fields remain
GitHub
. This ensures the shadow data is a clean JSON that can be stringified.

It updates the last sync timestamp in storage (lastSyncTime)
GitHub
.

It releases the sync lock and clears the syncing flag so that a new sync can run in the future
GitHub
. If it was a multi-library sync, it also resets the multi-library progress tracking.

The UI is notified (if applicable) that sync completed successfully (e.g., via a log message “Sync complete!”)
GitHub
GitHub
.

Throughout the process, there are frequent checks for an abort flag (e.g., if the user cancels the sync). The checkAbortFlag() utility looks for a session flag and if set, it stops the sync gracefully, resetting state and not processing further changes
GitHub
GitHub
. Progress updates are also written to session storage at various points so a UI progress bar can reflect the sync status in real-time
GitHub
GitHub
.

Summary of the flow: The connector first ensures the RemNote “workspace” for Zotero is ready, then pulls Zotero data and uses a diff/merge strategy to figure out what changed. It then mirrors those changes into RemNote, creating or updating rems and organizing them into the document tree. Finally, it populates those rems with detailed content and metadata. The design attempts to preserve changes made on the RemNote side by merging, but as we’ll discuss, the current implementation has limitations in capturing true bidirectional changes.

Code Quality Issues: Duplication and Complexity

While the overall design is sound, several parts of the codebase are convoluted or repetitive, which could hinder maintainability:

Mixed Responsibilities in TreeBuilder: The TreeBuilder class handles both scanning existing RemNote data and applying changes. These are two distinct concerns. Currently, TreeBuilder.initializeNodeCache() builds the node index, and then the same class’s methods like createItems, updateItems, etc., perform modifications. This means TreeBuilder has to manage plugin API calls for creating and editing Rems, which makes it quite large and detail-heavy. Separating the “read existing state” logic from the “apply new state” logic could make each part easier to understand. For instance, a dedicated RemNoteIndex module could handle gathering the existing rem mappings, while a separate SyncApplier or executor could handle performing create/update/delete operations given a ChangeSet. Right now, these are intermingled in TreeBuilder.

Duplicate Logic for Item Creation/Update: There is some redundancy in how items are created and updated, leading to scattered logic:

When creating an item in TreeBuilder.createItems(), the code adds the Zotero Item power-up and the specific item type power-up (if available), then sets the key property on the item
GitHub
. Later, during hydration, the ZoteroPropertyHydrator again adds the item type power-up to the Rem (without checking if it exists)
GitHub
. Similarly, hydration sets the item’s title text after creation already set it in some cases (e.g. updated items). For updated items, updateItems() already calls rem.setText(safeTitle) to update the title
GitHub
, yet the hydrator will again set the title (parsing it to rich text)
GitHub
. This double-setting isn’t harmful (the second set is essentially writing the same title), but it’s inefficient and confusing. It would be cleaner if setting the basic title was done in one place – perhaps delegate all text setting to the hydrator for consistency, while updateItems() should maybe only update structural aspects (like parent pointers). In fact, in “simple mode” (when hydration is skipped), they rely on updateItems() to at least set the title, which explains why that code is there. This indicates the design tries to cover both cases, but the result is duplicated functionality in normal mode.

The logic for adding power-ups is also duplicated. The item-type powerup addition could be done once. If creation ensures it, the hydrator could check and not repeat it. Or the responsibility could move entirely to hydrator: have createItems() just create a blank Rem with a Zotero key, and hydrator add all powerups and content. Right now it’s split, which means both need to be kept in sync. Reducing this overlap by clearly delineating responsibilities (e.g., TreeBuilder ensures existence of Rem and basic linking, Hydrator handles all content and tagging) would reduce potential bugs (for example, if tomorrow the code needs to ensure another property on creation, it might also need adding in hydrator).

In-line Handling of Missing Rems: In several places, the code handles the scenario “Rem not found in cache” by directly creating it on the fly. For example, TreeBuilder.updateCollections() will create a collection if it wasn’t found
GitHub
, and updateItems() will do the same for items
GitHub
. While this ensures the sync doesn’t skip anything, it scatters the creation logic across multiple functions. It might be better to ensure the ChangeSet itself accounts for these cases (as was partially done by adding missingItems to newItems earlier) so that by the time we apply changes, we only either update existing Rems or create new ones, rather than needing conditional logic in the middle of an update loop. Centralizing creation logic in createItems/createCollections would make the code path easier to follow. As is, one has to be aware that updateCollections might secretly call createCollections internally if something is missing
GitHub
 – a subtle flow that could be missed during maintenance.

Complex Multiple-Parent Handling: The logic in moveItems() for handling multiple collections (portal vs reference) is quite complex and a bit hard to follow in code form
GitHub
GitHub
. It mixes concerns of logging, portal creation, and reference creation inside the loop. This could be refactored into helper functions, e.g., createPortalForItem(rem, targetParent) and createReferenceForItem(rem, targetParent), which would encapsulate those details. Moreover, the approach of using a raw [{ i: 'q', _id: originalId }] JSON to set a reference is not self-documenting – a comment explains it’s a “workaround”
GitHub
, but a future maintainer might not immediately recognize this as creating a Rem reference. Abstracting that into a clearly named utility (like RemExecutor.createReferenceRem(originalRem, parentRem)) would both document the intent and isolate the hacky part. There’s also a possible bug here: if an item is new and belongs to multiple collections, it will appear in both newItems and movedItems (because the change detector flags moved when collections differ from base, and base for a new item is “no collections”)
GitHub
. The code then calls moveItems([...newItems, ...movedItems, ...updatedItems])
GitHub
, meaning a newly created item in multiple collections might be processed twice in moveItems. The logic doesn’t guard against duplicates, so it could potentially attempt to add duplicate portals or references. In practice, the item will be moved under the first collection on the first pass, then on the second pass (if the array contains the same item again) it might treat it as having one less parent (since it’s now in one collection) and maybe just log a warning for the second parent already handled. This isn’t a critical bug, but it is a sign that the coordination between “new” and “moved” lists could be tighter. Simplifying how moves are determined (perhaps exclude new items from movedItems or de-duplicate the list before processing) would make the behavior more predictable.

Progress and Abort Checks Scattered: The code frequently updates progress and checks for abort signals, which is good for responsiveness, but it adds noise to the core logic. Nearly every loop has if (onProgress) await onProgress(); and an if (await checkAbortFlag()) return; sprinkled in
GitHub
GitHub
. While necessary, this repetitive pattern could be abstracted. For example, a small wrapper function could handle “do each item with progress and abort check” to reduce repetition. This is a smaller issue, but refactoring it would cut down on visual clutter and potential mistakes (ensuring abort is checked consistently).

Inline Comments vs Implementation: There are places with outdated or minimal comments. For instance, the ChangeDetector uses full JSON string comparison for items, which is straightforward but might flag an item as updated even if only an unrelated field changed (that’s intended). However, a comment about using version numbers vs full data could be useful for clarity. Similarly, the TODO in ZoteroPropertyHydrator.hydrateItemAndCollectionProperties references a “buildTreeWithChanges function” (likely an old plan), which could confuse readers
GitHub
. Ensuring comments accurately describe current behavior (and removing stale references) will improve clarity.

In summary, the code would benefit from DRY (Don’t Repeat Yourself) principles and clearer separation. Redundancies like the double title-setting and power-up additions hint that the module boundaries (TreeBuilder vs Hydrator) are a bit blurred. The multi-step item handling (create -> maybe update -> move -> hydrate) requires careful tracking of state; right now, that state is spread across the change objects and the node cache in a way that works, but is not immediately transparent. By streamlining these flows and responsibilities, one can reduce complexity and make the sync pipeline easier to reason about.

Separation of Concerns: Refactoring Opportunities

To improve the maintainability of the sync pipeline, several refactoring strategies should be considered:

Introduce a RemExecutor (RemNote Operations Manager): A dedicated class or module for RemNote write operations could simplify the logic in TreeBuilder. For example, RemExecutor could provide methods like createCollectionRem(parentRem, collectionData), createItemRem(parentRem, itemData), updateRemText(rem, newText), deleteRem(rem), and moveRem(rem, newParent). Internally, these would wrap the plugin API calls (createRem, setParent, setText, etc.), along with the common steps like adding power-ups and setting the Zotero key. Right now, TreeBuilder.createItems and createCollections do very similar things (create a Rem, add powerup, set key)
GitHub
GitHub
. A unified RemExecutor could handle “create a new Rem for Zotero object X” in one place. For instance, instead of TreeBuilder doing:

const rem = await plugin.rem.createRem();
await rem.addPowerup(powerupCodes.COLLECTION);
await rem.setPowerupProperty(powerupCodes.COLLECTION, 'key', [collection.key]);


we could have:

const rem = await remExecutor.createCollection(collection.key);


which internally does the above steps. This shortens the TreeBuilder code and reduces duplication. It also makes it easier to handle errors (Rem creation failures could be logged in one spot). The TreeBuilder (or SyncApplier) would then focus on what to create or delete (based on changes), and the RemExecutor focuses on how. This separation of concerns would make the sync logic more declarative.

Separate Node Cache Construction: Currently, TreeBuilder holds the node cache and the logic to build it. This could be split out into a RemNoteIndex class that solely handles retrieving all Zotero-tagged rems and preparing the mappings. TreeBuilder (or SyncManager) would then use RemNoteIndex to get the initial mapping. The advantage is clarity (all the code dealing with reading RemNote state is in one place). It might also allow optimizations, like caching the index between sync runs or updating it incrementally as changes are applied, rather than rebuilding from scratch every time. For example, after applying changes, we could update the index for new and removed items instead of throwing it away. Having a separate index object could facilitate that. While rebuilding each time might be acceptable in performance for now, an explicit indexing module communicates the intent clearly: “this part is reading the KB state, while that part is writing new state.”

Refactor ZoteroSyncManager.syncLibrary: This method currently does a lot in one big try/catch block. Breaking it into helper functions would improve readability. For example:

prepareLibrarySync(libraryInfo) – does the ensure Rem exist, set syncing flag, initialize progress, etc.

fetchAndCompare(libraryInfo) – performs the data fetch and change detection, returning a ChangeSet.

applyChangesToRemNote(changeSet) – handles TreeBuilder applyChanges and property hydration.

finalizeSync() – saves state, releases locks, logs completion.

Each of these could be private methods in ZoteroSyncManager or even free functions that take the plugin context. This way, the high-level flow is evident from the method calls, and if something fails in one step, it’s easier to pinpoint. It also makes writing tests for each phase easier if this were a larger application. As it stands, syncLibrary is about ~140 lines of mixed logic; splitting it up would adhere to single-responsibility principles.

Clarify the Sync Data Flow: It’s helpful to establish clearer data structures to pass between phases. For instance, after detectChanges, we have a ChangeSet. We then enrich some items in it with merged data and Rem references. We might formalize this by having a type like PreparedChangeSet where updatedItems are guaranteed to have item.rem attached for those that exist, and maybe a flag for those that were newly created, etc. Right now, the code relies on side effects (like nodeCache being updated and the change objects mutated by merge and by TreeBuilder) to carry information forward. More explicit structures or return values could make it clearer. For example, TreeBuilder.applyChanges could return an object containing arrays of Rems that were created, updated, etc., which could then be passed to hydrator instead of hydrator sifting through the same ChangeSet. This isn’t strictly necessary, but it’s a thought for clarity – to avoid too much implicit state sharing (nodeCache and the changeSet being modified in place).

Improve Logging and Monitoring: The code currently logs to the RemNote log panel for certain events (like start, completion, abort, and debug info on counts)
GitHub
GitHub
. It might be beneficial to add logs when conflicts are merged (e.g., “Local edit preserved for field X” or “Remote change applied for field Y”) to help troubleshoot the merge behavior. Also, logging when an item is recreated because it was missing could alert the developer that perhaps a Rem was deleted by the user in between. Currently it does log “Item not found, creating it”
GitHub
, which is good. These kinds of logs, if kept (perhaps under a debug flag), will make it easier to identify where the sync logic might be going wrong during testing. Refactoring shouldn’t remove these; in fact, if there was a central RemExecutor, it could consistently log all create/update/delete actions in one format, which could be useful for auditing sync actions.

Modularize Multi-collection Logic: The two modes (“portal” vs “reference”) for multi-parent items could be encapsulated in their own small classes or strategies. For example, a MultipleCollectionStrategy interface with a method handleExtraParents(itemRem, extraParentRems). Then have two implementations: PortalStrategy and ReferenceStrategy. TreeBuilder.moveItems would simply decide which strategy based on the setting and call it. This would isolate the peculiar portal/reference creation code. It also makes it easier to extend if a new strategy is needed. As a bonus, one could unit-test these strategies in isolation (pass in some dummy Rem objects and ensure a portal or reference is created as expected).

Ensure Single Source of Truth for Rem Content Setting: Decide whether item text (title, note content) should be set during the structural phase or exclusively in the hydration phase, and stick to one. Given that “Simple Mode” bypasses hydration, it’s clear why updateItems() sets the title – otherwise, in simple mode an updated item’s title would never update. Perhaps a better design is: always perform a lightweight hydration for critical fields (like title) even in simple mode, rather than conflating it with structural update. Alternatively, after applyChanges, if simple mode is on, one could call a function to at least set titles of new/updated items. This would remove the need for updateItems() to do it. In normal mode, that function could be skipped or do nothing. By delineating “structure sync” vs “data sync,” maintainers won’t find title being set in two places. In code comments, explicitly note: “Title is set here because X mode might skip full hydration” – this will help understand the rationale if the duplication cannot be removed.

Implementing these changes would greatly enhance separation of concerns. The sync logic will read more like a series of clearly defined steps (fetch, diff, merge, apply, hydrate) rather than one large monolithic procedure. Each class would have a more focused role: e.g., ZoteroSyncManager (coordination & state), RemNoteIndex (read existing data), ChangeDetector (compute diffs), DataMerger (handle conflict resolution rules), RemExecutor (perform KB writes), PropertyHydrator (enrich content), etc. Not every one of those needs to be its own class, but this mental separation helps when refactoring into modules or at least separating functions. The result should be a pipeline that is easier to understand and modify – for example, adding a new conflict resolution rule or a new power-up property to sync would involve localized changes rather than touching many parts of the code.

Gaps in Bidirectional Sync and Conflict Resolution

Despite being called a “bidirectional” sync, the current implementation still leans heavily toward a one-way import from Zotero, with some preservation of local edits. There are some important gaps and potential incorrect flows in achieving full bidirectional synchronization:

No Zotero Update/Push Implemented: Nowhere in the sync flow do we see an update to Zotero’s data. The Zotero API class (ZoteroAPI) supports fetching libraries, items, and collections
GitHub
GitHub
, but there are no calls to update items or send local changes back. This means if a user changes something in RemNote (say, edits the title of a reference or adds a tag) and that change is captured in the merge result, the Zotero data in RemNote will reflect it (since the Rem is updated), but Zotero itself remains unchanged. Over time, Zotero could fall out of sync unless the user manually updates it. Full bidirectionality would require using Zotero’s API to push changes: e.g., calling apiConnection.items(itemKey).patch({...}) or similar for updated fields, and delete() calls for deletions. Without this, the “source of truth” is effectively still Zotero for most fields, and RemNote is somewhat read-only (with the exception of adding highlights or tags that remain only on the RemNote side). This is likely a planned area of development, as supporting write-back is non-trivial and would involve additional conflict handling (Zotero’s API has its own conflict detection via item version numbers).

Local Edits Not Fully Captured: The current conflict resolution assumes that any local changes to Zotero fields would be stored in the Rem’s fullData property and thus be available for three-way merge
GitHub
. However, in practice, if a user edits a Rem’s text (title) or other metadata directly in the RemNote interface, those changes do not automatically update the fullData JSON stored in the Rem. For example, a user could correct a title or add some text to a note Rem. The plugin wouldn’t know about this change because it doesn’t re-read the Rem’s content during sync – it only reads the fullData from last time (which still has the old title). Thus, when threeWayMerge runs, the localData it considers is essentially the same as the base (previous Zotero data), meaning it thinks there were no local changes at all. The outcome: the user’s manual changes in RemNote get overwritten by Zotero’s version on the next sync, because the merge logic will see remote != base and replace the field with remote’s value (since it missed that local diverged as well). In effect, many local edits in RemNote are not truly preserved, except in some narrow cases:

Tags and notes might be partly preserved because if a user adds a tag as a Rem reference (child) or edits a note’s content in RemNote, those could be merged (tags are power-up children and note content is part of the Rem text). But the plugin isn’t explicitly diffing Rem text for notes; it just merges arrays of note objects. If a RemNote user edits the text of a Zotero note Rem, Zotero wouldn’t know, and fullData still has the old content, so that edit is lost on sync (Zotero’s note text will overwrite it).

The design of storing fullData per Rem suggests the intention was to use it as a baseline for local vs base comparison. But since it’s not updated when the user makes a change (only when the plugin syncs), there is a missing piece: either live-tracking of local changes or a post-hoc diff of Rem content vs fullData. One approach could be: on sync, for each item, retrieve the Rem’s current text and key properties and compare them to shadowItem.data. If differences are found, treat those as local changes. This isn’t done currently.

Without such a mechanism, the only “local changes” that are recognized are those made via the plugin itself (for example, if in a future feature the plugin allowed editing Zotero fields through a custom interface that updates the fullData property accordingly). Regular RemNote edits are effectively invisible to the sync logic.

Deletion Conflicts (RemNote vs Zotero): As noted earlier, if a user deletes an item’s Rem in RemNote, the next sync will interpret that as the item being missing locally and will recreate it (since Zotero still has it, and the plugin currently always defers to Zotero’s existence)
GitHub
. This is a reasonable default (Zotero as source of truth for item existence), but it means users can’t truly delete an item from their knowledge base unless they delete it in Zotero. A more bidirectional approach would allow a deletion in RemNote to propagate back to Zotero (perhaps as a deletion or an “unlink” from a collection). However, implementing that requires caution – accidental deletions in a note-taking app might unintentionally remove library items. Alternatively, the plugin could mark the item as “removed locally” (maybe via a special power-up) and then either ignore that item on future syncs or prompt the user on what to do. None of that is implemented now. The gap is that there’s no way to prefer a RemNote deletion over Zotero data; Zotero will always re-add it. This is something to document for users to avoid confusion.

Potential Merge Misbehavior: Because local changes aren’t fully detected, the current three-way merge effectively reduces to a two-way merge in most cases (base vs remote, with a bias to remote for core fields, and union for arrays). Thus, automated conflict resolution is limited. It will handle Zotero-side changes well, but if both sides changed the same field differently, often Zotero wins by design for core fields or remote-changed fields. For example, if both Zotero and the user in RemNote edited the Title, the code will always choose Zotero’s title (since Title is a core field)
GitHub
GitHub
, and the user’s change is lost without notice. For non-core fields, if both sides edited, it depends: the logic baseVal !== undefined && remoteVal !== baseVal ? remoteVal : localVal means if the remote value differs from base, the remote wins; it does not explicitly check if local also differed from base. So in any case where Zotero changed a field (even if the user also did), Zotero’s change applies and the user’s is dropped
GitHub
. The user’s change would only stick if Zotero’s copy remained the same as before. So the conflict resolution is effectively “Zotero priority” except for notes/tags where it merges. This is a defensible strategy (especially if we assume Zotero is the canonical source), but it means “bidirectional” is limited to non-conflicting local edits. Users might be surprised that some changes in RemNote don’t propagate or even persist.

Missing Write-Back for Notes and Annotations: The plugin creates RemNote child documents for Zotero notes and annotations, but if a user edits those in RemNote, Zotero is not updated accordingly. Ideally, a true two-way sync would push those edits back to Zotero’s notes. Similarly, adding a new note under a reference in RemNote could be detected and a corresponding Zotero note created. Currently, the plugin doesn’t do that – it neither monitors for new Rem children nor uses Zotero’s create note API. This is a feature gap. It’s possible the developers intend the workflow such that notes are primarily edited in Zotero or just viewed in RemNote. But many would expect a bi-directional integration to allow editing notes on either side.

Handling of Attachment Annotations: Zotero’s new PDF annotations are treated as items of type “annotation” with an annotationText. The plugin does bring those in as RemNote rems (similar to notes). However, if the user adds highlights or comments to PDFs in RemNote’s PDF reader, those might not link back to Zotero’s annotations unless explicitly designed. There’s no evidence in this branch that such reverse linking is implemented. That’s another angle of bidirectionality (RemNote’s PDF annotation to Zotero) that likely remains to be done.

Overall, the current flow is mostly one-directional with conflict avoidance: it tries not to overwrite local additions like tags or notes (merging them in), but it doesn’t truly sync changes back to Zotero. “Automated merge conflict resolution” is implemented for the case of simultaneous changes, but with the bias to trust Zotero for most fields.

Key implementation gaps identified:

Updating Zotero with local changes: Needs new functions in ZoteroAPI and calls after the RemNote side is updated. For example, after applying changes, the plugin could collect all items whose mergedData differs from remoteData and call an update for each. This would use Zotero’s API and the If-Unmodified-Since-Version header with the old version to avoid overwriting external changes. This is non-trivial but essential for true bidirectional sync.

Capturing RemNote edits: The plugin should detect edits made to item titles, content, etc., in RemNote since last sync. One approach is maintaining a hash or last-edited timestamp in the Rem’s data, or diffing the Rem’s current text against the stored fullData. Perhaps utilizing RemNote’s built-in change tracking (if any accessible via the plugin API) could help. Without this, user edits will continue to be overwritten silently.

User feedback on conflicts: Right now, the user is not informed if a conflict occurred and one side’s change was dropped. In a more mature sync solution, the user might be notified (“Title changed on both sides; using Zotero’s version.”) or at least such events could be logged in a debug log for review. Implementing a conflict log or a visual indicator on conflicted rems could enhance transparency.

Robust error handling and abort recovery: If something goes wrong mid-sync (say, network error, or a RemNote API call fails), the system might be left in a partially synced state. The code already attempts to handle an “Incomplete previous sync” by resetting state at next run
GitHub
. However, conflict resolution might be impacted if half-merged data was saved. Ensuring that the shadow copy only updates after everything succeeds is important (it appears the code does save at the end, which is correct
GitHub
). If bidirectional features are added, error handling becomes even trickier (since you might have partially updated Zotero by the time something fails). Planning for rollback or at least careful ordering (e.g., update Zotero after RemNote is confirmed updated or vice versa) will be needed.

In summary, to truly support full bidirectional syncing, significant new functionality must be added: tracking local changes, deciding when/how to propagate them to Zotero, and possibly resolving conflicts in a more nuanced way (or at least informing the user). The current branch lays a solid foundation with one-way sync and partial conflict merging, but it does not yet fulfill all the requirements of two-way synchronization. Recognizing these gaps is the first step to addressing them in future development.

Recommendations and Next Steps

Based on the analysis above, here are concrete suggestions to improve the syncing system’s clarity, robustness, and bidirectional capabilities:

Refactor into Clear Modules: Break the monolithic sync logic into modular components. For instance:

Indexing Module: Handle scanning RemNote for existing Zotero rems (what initializeNodeCache does). This could be a function or class that returns a nodeCache and perhaps also structured info like “libraryRem” and “unfiledRem” for the current library.

Change Computation: The ChangeDetector is already separate; ensure it remains focused only on computing diffs. It might be expanded in the future to also detect local-only changes.

Merge Processor: Encapsulate the three-way merge in a dedicated function (it already is, via threeWayMerge). If local change detection improves, this module might take additional inputs (e.g., an object of fields that were locally edited).

RemNote Sync Applier: Consider creating a higher-level class (e.g., RemNoteSyncApplier) that uses the RemExecutor to apply a given ChangeSet to RemNote. This could internally use TreeBuilder’s logic but with a cleaner interface. For example, syncApplier.applyChangeSet(changeSet, nodeCache) could iterate through each category of change and call methods on a RemExecutor. This makes the flow of applying changes more explicit and testable.

Implement a RemExecutor for Rem Operations: As discussed, centralize all interactions with the RemNote API:

Creation: RemExecutor.createItem(item: Item): Rem would create a Rem for an item (under Unfiled or a specified parent), add the Zotero Item power-up, and set the key property. It might also add the item type power-up if available. The function returns the created Rem (or throws if failed) so the caller can then attach content.

Update: RemExecutor.updateItem(rem: Rem, item: Item) could update a Rem’s basic fields (e.g., title) and perhaps handle simple property updates if any. However, detailed property setting might remain in the hydrator.

Deletion: RemExecutor.removeRem(rem: Rem) wraps rem.remove() and any additional cleanup needed (like removing references from nodeCache).

Moving: RemExecutor.moveRem(rem: Rem, newParent: Rem) wraps rem.setParent(newParent).

Portal/Reference creation: Perhaps RemExecutor.createPortal(rem: Rem, targetParent: Rem) and RemExecutor.createReference(rem: Rem, targetParent: Rem) implementing those multi-parent strategies.

By having these methods, the sync logic in TreeBuilder or SyncApplier becomes a sequence of high-level calls without the low-level details. For example, instead of several lines to create an item, we do const rem = remExec.createItem(item). This not only reduces code duplication but makes the intent clear (“we are creating a new item Rem here”). It also consolidates error handling around Rem creation in one place – making it easier to add retries or better error messages in the future.

Enhance Detection of Local Changes: To truly merge two-way, the system should detect when a Rem’s content was edited outside of the plugin’s knowledge. Possible approaches:

During sync, for each item in prevData (or each Rem in nodeCache), compare the Rem’s current key properties (title, etc.) to those in prevData. For example, get the Rem’s current name text via rem.getText() and compare to prevItem.data.title. If they differ and Zotero’s current title equals the prev title, this suggests a local edit. You could mark this item in a structure like locallyModifiedItems with the fields that changed. Then adjust the merge logic to treat those fields as needing to be preserved (perhaps by injecting them into localData before calling threeWayMerge).

For notes, perhaps compare the content of the Rem’s first child (which holds the note body) to the prevData’s note text.

Track last modification times: If RemNote’s API can give a last edited timestamp for a Rem or we maintain a custom property for “last synced vs last edited”, we could determine if a Rem was changed after the last sync. For example, store a lastSynced timestamp in the Rem’s data and compare it to rem.lastModified (if available) on next sync.

This area likely requires some experimentation, but it’s crucial for bidirectionality. Even implementing a basic check for title and note text differences would cover the most common edits.

Add Zotero Write-Back Functions: Extend the ZoteroAPI class to include:

updateItem(library, item) – use Zotero’s API to send updated fields for the given item (with proper versioning to avoid conflicts).

createItem(library, item) – possibly for cases where a new item is added in RemNote (not currently supported, but for future).

deleteItem(library, itemKey) – to remove an item or remove it from a collection in Zotero if it was deleted in RemNote.

Then integrate these calls into the sync flow. Likely, after merging and applying to RemNote, you would have a list of resolved changes that need pushing to Zotero. For example, if an item’s title was changed locally and remote didn’t change, after sync RemNote has the new title and the item’s mergedData has the local title. The plugin should call updateItem to update Zotero’s title so both sides match. The logic might be: for each updated item in ChangeSet, if mergedData differs from remoteData (the original Zotero data fetched) on any field, push those field changes to Zotero. The mergedData is effectively the truth after conflict resolution.

This needs caution: you wouldn’t want to push changes that originated from Zotero itself (e.g., if Zotero changed a field and we accepted it, mergedData differs from remoteData but that difference was from Zotero, no need to push). Perhaps keep track of which fields were overridden by local in the merge process (e.g., local tags added).

At minimum, pushing local-only new tags and edited notes to Zotero would be valuable. Zotero’s API allows updating tags and notes easily by sending the new arrays or content with the latest version.

User Control and Transparency: Consider providing some interface or at least logs for conflicts. The user might benefit from a “Conflict Resolution” report after sync, especially once true two-way edits are enabled. In the interim, ensuring that the debug log (when debug mode is on) prints out any three-way merge decisions could help developers and power users understand what happened. For instance, log an entry: “Conflict on item XYZ: using Zotero’s Title, kept local Abstract, merged tags [A, B, C].”

Testing with Various Scenarios: After refactoring, it would be important to test the sync thoroughly:

Zotero-only changes (ensure they reflect in RemNote),

RemNote-only changes (ensure they either persist and optionally push to Zotero),

Both-side changes (verify conflict rules),

RemNote deletion vs Zotero deletion (make sure deletes aren’t reappearing incorrectly or wiping Zotero unintendedly).
Setting up a battery of automated tests could be challenging without a mock Zotero API and a mock RemNote API, but even some manual testing scripts or a simulation mode would help. Perhaps create some unit tests for threeWayMerge (there might already be, given the TODOs about adding tests) and for ChangeDetector to ensure moves and updates are identified correctly.

Maintain Backward Compatibility (if needed): If there are existing RemNote data from previous versions of the plugin, ensure the new logic can handle it. For example, if earlier versions didn’t store fullData or used a different format, the code should be robust to that (maybe by re-fetching if needed or re-initializing the data map). The syncing-beta-3 suggests this is already a testing branch, but keeping migration in mind is wise.

By implementing these recommendations, the Zotero-RemNote connector would become cleaner in architecture and closer to true two-way sync. The sync pipeline will be easier to follow and maintain, as each part has a well-defined role. Automated merge conflicts would be more reliably handled, and eventually users would be able to trust that changes in either Zotero or RemNote will be reflected on the other side (with sensible rules for conflicts). The path to that goal involves not just code refactoring but also adding the missing pieces for capturing and pushing local changes, which the current branch has set the stage for but not yet realized. With a modularized codebase, adding those features will be significantly easier and less error-prone.