/*  src/widgets/hooks.ts
    ────────────────────────────────────────────────────────────────
    Shared React hooks for floating widgets.                       */

import { AppEvents, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import * as React from 'react';
import { POPUP_Y_OFFSET } from '../constants/constants';

/**
 * Keeps a floating widget glued to the editor caret.
 *
 * @param id      widget id (from widget context)
 * @param hidden  when true the hook does nothing – useful when
 *                the widget is invisible and shouldn’t reposition.
 */
export function useSyncWidgetPositionWithCaret(id: string | undefined, hidden: boolean) {
	const plugin = usePlugin();
	const caret = useCaret(); // (see helper below)

	/* whenever the caret moves → move the widget */
	React.useEffect(() => {
		if (!id || hidden || !caret) return;
		plugin.window.setFloatingWidgetPosition(id, {
			top: caret.y + POPUP_Y_OFFSET,
			left: caret.x,
		});
	}, [caret?.x, caret?.y, hidden, id, plugin, caret]);
}

/* ---------------------------------------------------------------- */
/* local helpers                                                    */

function useCaret(): DOMRect | null {
	const plugin = usePlugin();
	const [pos, setPos] = React.useState<DOMRect | null>(null);

	// update on every edit
	useAPIEventListener(AppEvents.EditorTextEdited, undefined, async () => {
		const caretPos = await plugin.editor.getCaretPosition();
		setPos(caretPos ?? null);
	});

	return pos;
}
