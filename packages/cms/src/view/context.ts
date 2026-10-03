import { createContext, useContext } from 'react';
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
