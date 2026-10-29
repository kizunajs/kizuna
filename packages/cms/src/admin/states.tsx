import type { ReactNode } from 'react';
import { FileQuestionMark, Lock } from 'lucide-react';
import { ICON } from '../view/context.js';
import { onApple } from './command-palette.js';

/**
 * Where a state screen sends the editor instead.
 */
export interface Way {
    label: string;
    href: string;
}

function StateScreen({ icon, heading, text, children }: { icon: ReactNode; heading: string; text: string; children: ReactNode }) {
    return (
        <section className="k-state" aria-labelledby="k-state-heading">
            <span className="k-state__icon" aria-hidden="true">
                {icon}
            </span>
            <div className="k-state__text">
                <h2 className="k-state__heading" id="k-state-heading">
                    {heading}
                </h2>
                <p className="k-state__detail">{text}</p>
            </div>
            <div className="k-state__actions">{children}</div>
        </section>
    );
}

/**
 * A document or record the editor's role may not change: what they cannot
 * do, who can change that, and the way back.
 */
export function NoAccess({ title, role, back }: { title: string; role: string; back: Way }) {
    return (
        <StateScreen
            icon={<Lock {...ICON} />}
            heading={`You can’t edit ${title}`}
            text={`${role} can’t change ${title}. An admin can give you access.`}>
            <a className="k-button k-button--primary" href={back.href}>
                {back.label}
            </a>
        </StateScreen>
    );
}

/**
 * An address nothing answers to, like a deleted article: what is missing, and
 * the list it would be in or a search for it.
 */
export function NotFound({ noun, back, onSearch }: { noun: string; back: Way; onSearch: () => void }) {
    return (
        <StateScreen
            icon={<FileQuestionMark {...ICON} />}
            heading={`No ${noun} has this address`}
            text={`The link may have a typo, or the ${noun} was deleted.`}>
            <a className="k-button k-button--primary" href={back.href}>
                {back.label}
            </a>
            <button type="button" className="k-button k-button--secondary" aria-haspopup="dialog" onClick={onSearch}>
                Search
                <kbd className="k-state__shortcut" aria-hidden="true">
                    {onApple() ? '⌘K' : 'Ctrl K'}
                </kbd>
            </button>
        </StateScreen>
    );
}

/**
 * The address the browser shows, for the header's line of a screen that
 * found nothing there.
 */
export const shownAddress = (): string => decodeURIComponent(`${window.location.pathname}${window.location.hash}`);
