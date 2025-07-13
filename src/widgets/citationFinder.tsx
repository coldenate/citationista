/*  src/widgets/citationFinder.tsx  */
import './citationFinder.css';
import {
	renderWidget,
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

	/* search */
	const [query, setQuery] = React.useState('');
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

	/* click → insert & close */
	async function choose(i: number) {
		const sel = results[i];
		if (!sel) return;

		const txt =
			mode === 'bib'
				? await fetchZoteroBibliography(plugin, sel.key)
				: await fetchZoteroCitation(plugin, sel.key);

		if (txt) await plugin.editor.insertPlainText(txt);
		wid && plugin.window.closeFloatingWidget(wid);
	}

	/* UI */
	return (
		<div id="citation-finder-root">
			<input
				className="citation-finder-input"
				autoFocus
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
							className="citation-finder-item"
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
