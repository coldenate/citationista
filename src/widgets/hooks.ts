import { AppEvents, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import * as React from 'react';
import { POPUP_Y_OFFSET } from '../constants/constants';

export const useSyncWidgetPositionWithCaret = (
    floatingWidgetId: string | undefined,
    hidden: boolean
) => {
    const plugin = usePlugin();
    const caretPos = useCaretPosition();
    React.useEffect(() => {
        const effect = async () => {
            if (floatingWidgetId && caretPos) {
                await plugin.window.setFloatingWidgetPosition(floatingWidgetId, {
                    top: caretPos.y + POPUP_Y_OFFSET,
                    left: caretPos.x,
                });
            }
        };
        if (!hidden) effect();
    }, [caretPos?.x, caretPos?.y, floatingWidgetId, hidden, plugin, caretPos]);
};

const useCaretPosition = (): DOMRect | null => {
    const plugin = usePlugin();
    const [caret, setCaret] = React.useState<DOMRect | null>(null);
    useAPIEventListener(AppEvents.EditorTextEdited, undefined, async () => {
        const c = await plugin.editor.getCaretPosition();
        setCaret(c ?? null);
    });
    return caret;
};
