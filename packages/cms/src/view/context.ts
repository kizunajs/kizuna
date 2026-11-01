import { createContext, useContext, type ReactNode } from 'react';
import type { Connection } from './connection.js';

/**
 * What every control reaches without being handed it.
 */
export interface EditorContextValue {
    connection: Connection;
    /**
     * Where the browser loads an image path from, or undefined when the CMS
     * does not know where the site is.
     */
    resolveUrl: (url: string) => string | undefined;
    /**
     * Where the open document is on the site, for a control that shows it.
     */
    pageUrl: string | undefined;
    /**
     * Says in a toast what a control just did, with Undo, where the editor
     * shows toasts. Answers what closes the toast.
     */
    offerUndo?: (message: string, undo: () => void) => () => void;
    /**
     * Draws a site's mark, by its key or `default` for shared content, where
     * the editor knows its sites. Without it, a control draws the icon the
     * CMS answers.
     */
    siteMark?: (site: string) => ReactNode;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export const useEditorContext = (): EditorContextValue => {
    const value = useContext(EditorContext);
    if (value === null) throw new Error('A control rendered outside the editor.');
    return value;
};

/**
 * The size and weight every icon in the editor draws at.
 */
export const ICON = {
    size: 15,
    strokeWidth: 1.75,
};
