/*  src/widgets/citationFinder.tsx  */
import './citationFinder.css';
import {
	AppEvents,
	renderWidget,
	useAPIEventListener,
	usePlugin,
	useRunAsync,
	useTracker,
	type WidgetLocation,
} from '@remnote/plugin-sdk';
import * as React from 'react';
import {
	escapeKeyID,
	powerupCodes,
	selectItemKeyID,
	selectNextKeyID,
	selectPreviousKeyID,
} from '../constants/constants';
import { fetchZoteroBibliography, fetchZoteroCitation } from '../services/citationHelpers';

interface ZoteroItem {
	id: string;
	key: string;
	title: string;
}

function CitationFinderWidget() {
	const plugin = usePlugin();

	// floating-widget context (needed only for close)
	const ctx = useRunAsync(
		async () => await plugin.widget.getWidgetContext<WidgetLocation.FloatingWidget>(),
		[]
	);
	const wid = ctx?.floatingWidgetId;

	// citation vs bibliography mode (set by the command)
	const mode = useRunAsync(async () => {
		const m = (await plugin.storage.getSession('citationFinderMode')) as string | undefined;
		return m === 'bib' ? 'bib' : 'citation';
	}, []);

	// placeholder inserted by the command
	const placeholder =
		useRunAsync(
			async () =>
				(await plugin.storage.getSession('citationPlaceholder')) as boolean | undefined,
			[]
		) ?? false;

	// search state
	const [query, setQuery] = React.useState('');
	const [selIdx, setSel] = React.useState(0);

	// live Zotero search results
	const results =
		useTracker(
			async (rp) => {
				if (!query.trim()) return [] as ZoteroItem[];

				const token = await rp.richText.text(query).value();
				const hits = await rp.search.search(token, undefined, { numResults: 50 });

				const out: ZoteroItem[] = [];
				for (const r of hits) {
					if (!(await r.hasPowerup(powerupCodes.ZITEM))) continue;
					const key = await r.getPowerupProperty(powerupCodes.ZITEM, 'key');
					const title = await rp.richText.toString(r.text ?? []);
					if (key && title)
						out.push({ id: r._id, key: String(key), title: title.trim() });
				}
				return out;
			},
			[query]
		) ?? [];

	// reset highlight whenever results change
	React.useEffect(() => setSel(0), []);

	// user-configurable hotkeys
	const selectNextKey = useTracker(async (p) => await p.settings.getSetting(selectNextKeyID)) as
		| string
		| undefined;
	const selectPrevKey = useTracker(
		async (p) => await p.settings.getSetting(selectPreviousKeyID)
	) as string | undefined;
	const selectItemKey = useTracker(async (p) => await p.settings.getSetting(selectItemKeyID)) as
		| string
		| undefined;
	const escapeKey = useTracker(async (p) => await p.settings.getSetting(escapeKeyID)) as
		| string
		| undefined;

	const hotkeysReady = Boolean(selectNextKey && selectPrevKey && selectItemKey && escapeKey);
	const hidden = results.length === 0;

	// grab / release keys from the editor while popup visible
	React.useEffect(() => {
		if (!wid || !hotkeysReady) return;
		const keys = [selectNextKey, selectPrevKey, selectItemKey, escapeKey].filter(
			(k): k is string => typeof k === 'string'
		);

		if (!hidden) plugin.window.stealKeys(wid, keys);
		else plugin.window.releaseKeys(wid, keys);

		return () => {
			plugin.window.releaseKeys(wid, keys);
		};
	}, [
		wid,
		hidden,
		hotkeysReady,
		selectNextKey,
		selectPrevKey,
		selectItemKey,
		escapeKey,
		plugin.window.releaseKeys,
		plugin.window.stealKeys,
	]);

	// handle keys stolen from the editor (when caret is still in editor)
	useAPIEventListener(AppEvents.StealKeyEvent, wid, ({ key }) => {
		if (!hotkeysReady) return;
		if (key === selectNextKey) moveSelection(1);
		else if (key === selectPrevKey) moveSelection(-1);
		else if (key === selectItemKey) choose(selIdx);
		else if (key === escapeKey) wid && plugin.window.closeFloatingWidget(wid);
	});

	// helper to change highlighted row with wrap-around
	function moveSelection(delta: 1 | -1) {
		setSel((i) => {
			if (results.length === 0) return 0;
			const max = results.length;
			return (i + delta + max) % max;
		});
	}

	// cleanup placeholder on close
	React.useEffect(() => {
		return () => {
			if (placeholder) {
				plugin.editor.deleteCharacters(1, -1);
				plugin.storage.setSession('citationPlaceholder', false);
			}
		};
	}, [placeholder, plugin.editor.deleteCharacters, plugin.storage.setSession]);

	// insert chosen citation and close widget
	async function choose(i: number) {
		const sel = results[i];
		if (!sel) return;

		if (placeholder) {
			await plugin.editor.deleteCharacters(1, -1);
			await plugin.storage.setSession('citationPlaceholder', false);
		}

		const txt =
			mode === 'bib'
				? await fetchZoteroBibliography(plugin, sel.key)
				: await fetchZoteroCitation(plugin, sel.key);

		if (txt) await plugin.editor.insertPlainText(txt);
		wid && plugin.window.closeFloatingWidget(wid);
	}

	// ref to search input so we can focus it and catch arrow keys
	const inputRef = React.useRef<HTMLInputElement>(null);
	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// handle physical key presses while focus is on the search input
	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown' || e.key === selectNextKey) {
			e.preventDefault();
			moveSelection(1);
		} else if (e.key === 'ArrowUp' || e.key === selectPrevKey) {
			e.preventDefault();
			moveSelection(-1);
		} else if (e.key === 'Enter' || e.key === selectItemKey) {
			e.preventDefault();
			choose(selIdx);
		} else if (e.key === 'Escape' || e.key === escapeKey) {
			e.preventDefault();
			wid && plugin.window.closeFloatingWidget(wid);
		}
	};

	// UI
	return (
		<div id="citation-finder-root">
			<input
				ref={inputRef}
				id="citation-finder-input"
				className="citation-finder-input"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={handleInputKeyDown}
				placeholder="Search Zotero items…"
			/>
			{results.length > 0 && (
				<div className="citation-finder-results">
					{results.map((it, idx) => (
						<button
							key={it.id}
							type="button"
							className={`citation-finder-item${idx === selIdx ? ' selected' : ''}`}
							onClick={() => choose(idx)}
						>
							{it.title}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

renderWidget(CitationFinderWidget);
