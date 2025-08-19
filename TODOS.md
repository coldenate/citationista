-   [ ] Converting the Zotero Library Rem into a folder. #TODO: waiting on Plugin SDK to be patched\
-   [x] Identify which fields should always favor remote values and which should merge (e.g., tags, notes).
-   [x] Update threeWayMerge.ts accordingly and add more unit tests or console output to verify results.
-   [x] Handling multiple URLs when hydrating properties.
-   [x] Finalize Zotero Item Type Definitions
-   [x] Continue merging your “attempt 1” and “attempt 2” type files into a comprehensive Data interface aligned with Zotero’s schema (see src/types).
-   [x] Replace the any in types.ts so synced items carry strongly typed data.
-   [x] Expand treeBuilder and mergeUpdatedItems to recognize Zotero notes/annotations and create corresponding child Rems instead of dumping them into “Unfiled Items.”
-   [x] Add logging/breakpoints around the unfiled-items code path to inspect data and ensure proper parentage

Refactor plan
-   [ ] See `REFACTOR_TODO.md` for the modular sync pipeline checklist (Index, Diff, Merge, Executor, SyncApplier, Hydrator, Manager split, strategies, tests).