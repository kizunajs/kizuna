import { useEffect } from 'react';

let kanji: HTMLLinkElement[] | undefined;

/**
 * Shows `icon` in the browser tab, or the kanji the page was built with for
 * `undefined`, following it as it changes.
 */
export const useTabIcon = (icon: string | undefined): void => {
    useEffect(() => {
        const head = window.document.head;
        kanji ??= [...head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
        for (const link of head.querySelectorAll('link[rel="icon"]')) link.remove();
        if (icon === undefined) {
            head.append(...kanji);
            return;
        }
        const link = window.document.createElement('link');
        link.rel = 'icon';
        link.href = icon;
        head.append(link);
    }, [icon]);
};
