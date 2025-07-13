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
import { powerupCodes } from '../constants/constants';
import { fetchZoteroBibliography, fetchZoteroCitation } from '../services/citationHelpers';

interface ZoteroItem {
	id: string;
	key: string;
	title: string;
}

function CitationFinderWidget() {
	const plugin = usePlugin();

	/* floating-widget context (needed only for close) */
	const ctx = useRunAsync(
		async () => await plugin.widget.getWidgetContext<WidgetLocation.FloatingWidget>(),
		[]
	);
	const wid = ctx?.floatingWidgetId;

	/* citation vs bibliography mode (set by the command) */
	const mode = useRunAsync(async () => {
		const m = (await plugin.storage.getSession('citationFinderMode')) as string | undefined;
		return m === 'bib' ? 'bib' : 'citation';
	}, []);

	/* placeholder inserted by the command */
	const placeholder =
		useRunAsync(
			async () =>
				(await plugin.storage.getSession('citationPlaceholder')) as boolean | undefined,
			[]
		) ?? false;

	/* search */
	const [query, setQuery] = React.useState('');
	const [selIdx, setSel] = React.useState(0);
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

	/* steal navigation keys */
	const HOTKEYS = ['down', 'up', 'enter', 'tab'];
	React.useEffect(() => {
		if (!wid) return;
		plugin.window.stealKeys(wid, HOTKEYS);
		return () => {
			plugin.window.releaseKeys(wid, HOTKEYS);
		};
	}, [wid, plugin.window.releaseKeys, plugin.window.stealKeys]);

	useAPIEventListener(AppEvents.StealKeyEvent, wid, ({ key }) => {
		if (key === 'down') setSel((i) => Math.min(i + 1, results.length - 1));
		if (key === 'up') setSel((i) => Math.max(i - 1, 0));
		if (key === 'enter' || key === 'tab') choose(selIdx);
	});

	/* cleanup placeholder on close */
	React.useEffect(() => {
		return () => {
			if (placeholder) {
				plugin.editor.deleteCharacters(1, -1);
				plugin.storage.setSession('citationPlaceholder', false);
			}
		};
	}, [placeholder, plugin.editor.deleteCharacters, plugin.storage.setSession]);

	/* click → insert & close */
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

	/* UI */
	const inputRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div id="citation-finder-root">
			<input
				ref={inputRef}
				id="citation-finder-input"
				className="citation-finder-input"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
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
