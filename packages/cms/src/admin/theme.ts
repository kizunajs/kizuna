import { useEffect, useState } from 'react';

/**
 * The editor's choice of light or dark: the system's, or one of them always.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
    {
        value: 'system',
        label: 'System',
    },
    {
        value: 'light',
        label: 'Light',
    },
    {
        value: 'dark',
        label: 'Dark',
    },
];

const STORAGE_KEY = 'kizuna-cms-theme';

/**
 * The theme a choice shows, given whether the system is light.
 */
export const themeOf = (choice: ThemeChoice, systemLight: boolean): 'light' | 'dark' => {
    if (choice === 'system') return systemLight ? 'light' : 'dark';
    return choice;
};

/**
 * A stored choice, read back, or the system's when nothing usable is stored.
 */
export const choiceOf = (stored: string | null): ThemeChoice => THEME_CHOICES.find((choice) => choice.value === stored)?.value ?? 'system';

const readChoice = (): ThemeChoice => {
    try {
        return choiceOf(window.localStorage.getItem(STORAGE_KEY));
    } catch {
        return 'system';
    }
};

const storeChoice = (choice: ThemeChoice): void => {
    try {
        if (choice === 'system') window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
        // Storage is off, so the choice lasts until the page closes.
    }
};

/**
 * The editor's theme choice, remembered in this browser, with the light or
 * dark it shows set on the root element, where the tokens read it. System
 * follows the system as it changes.
 */
export const useTheme = (): [ThemeChoice, (choice: ThemeChoice) => void] => {
    const [choice, setChoice] = useState<ThemeChoice>(readChoice);
    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: light)');
        const apply = (): void => {
            window.document.documentElement.dataset['theme'] = themeOf(choice, query.matches);
        };
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, [choice]);
    const choose = (next: ThemeChoice): void => {
        storeChoice(next);
        setChoice(next);
    };
    return [choice, choose];
};
