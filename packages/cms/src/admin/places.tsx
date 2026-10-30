import { useEffect, useState, type ReactNode } from 'react';
import { ChevronsUpDown, Library } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { AdminSite } from './config.js';
import { ALL_SITES, SHARED_GROUP, type Place, type Screen } from './navigation.js';
import { AllSitesIcon, SiteFinder, SiteIcon } from './site-switcher.js';

const PINS_KEY = 'kizuna-cms:pinned-sites';

/**
 * How many sites start pinned when the editor has pinned none.
 */
const FIRST_PINS = 3;

/**
 * The sites the editor pinned to the sidebar, kept for their next visit,
 * and a toggle for one.
 */
export const usePins = (sites: readonly AdminSite[]): [ReadonlySet<string>, (site: string) => void] => {
    const [pinned, setPinned] = useState<ReadonlySet<string>>(() => {
        try {
            const stored = window.localStorage.getItem(PINS_KEY);
            if (stored !== null) return new Set(JSON.parse(stored) as string[]);
        } catch {
            // Storage may be blocked, which leaves the first sites pinned.
        }
        return new Set(sites.slice(0, FIRST_PINS).map((site) => site.key));
    });
    const toggle = (site: string): void =>
        setPinned((current) => {
            const next = new Set(current);
            if (!next.delete(site)) next.add(site);
            try {
                window.localStorage.setItem(PINS_KEY, JSON.stringify([...next]));
            } catch {
                // Storage may be blocked, so the pin lasts the visit.
            }
            return next;
        });
    return [pinned, toggle];
};

const RECENT_KEY = 'kizuna-cms:recent-sites';

/**
 * How many recently opened sites the finder lists.
 */
const RECENT_SITES = 3;

/**
 * The sites the editor opened lately, newest first, kept for their next
 * visit, following the site shown.
 */
export const useRecent = (site: string | undefined): readonly string[] => {
    const [recent, setRecent] = useState<readonly string[]>(() => {
        try {
            return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
        } catch {
            return [];
        }
    });
    useEffect(() => {
        if (site === undefined) return;
        setRecent((current) => {
            if (current[0] === site) return current;
            const next = [site, ...current.filter((key) => key !== site)].slice(0, RECENT_SITES);
            try {
                window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
            } catch {
                // Storage may be blocked, so the list lasts the visit.
            }
            return next;
        });
    }, [site]);
    return recent;
};

/**
 * What a place is called and shows as, for the places list and the path bar.
 */
const placeLabelOf = (place: Place, sites: readonly AdminSite[]): string =>
    place.kind === 'all'
        ? ALL_SITES
        : place.kind === 'shared'
          ? SHARED_GROUP
          : (sites.find((site) => site.key === place.site)?.label ?? place.site);

function PlaceIcon({ place, sites }: { place: Place; sites: readonly AdminSite[] }) {
    if (place.kind === 'all') return <AllSitesIcon />;
    if (place.kind === 'shared') {
        return (
            <span className="k-site-icon" aria-hidden="true">
                <Library {...ICON} />
            </span>
        );
    }
    return <SiteIcon site={sites.find((site) => site.key === place.site)} />;
}

interface PlaceProps {
    sites: readonly AdminSite[];
    place: Place;
    allSites: boolean;
    screen: Screen;
    pinned: ReadonlySet<string>;
    recent: readonly string[];
    onPin: (site: string) => void;
}

/**
 * The head of the sidebar: the place shown, its mark and name.
 */
export function PlaceHead({ place, sites }: { place: Place; sites: readonly AdminSite[] }) {
    return (
        <div className="k-place-head">
            <PlaceIcon place={place} sites={sites} />
            <span className="k-place-head__name">{placeLabelOf(place, sites)}</span>
        </div>
    );
}

/**
 * One step of the path bar after the place: its label, and where it leads.
 */
export interface PathStep {
    label: string;
    href?: string;
}

/**
 * The bar across the top of a screen: the place, which opens the finder,
 * its dashboard, then the steps to the screen.
 */
export function PathBar({
    dashboard,
    steps,
    search,
    ...props
}: PlaceProps & {
    /**
     * The place's dashboard, which follows the place, `undefined` on the
     * dashboard itself, or `false` for a place without one, like Shared.
     */
    dashboard: string | false | undefined;
    steps: readonly PathStep[];
    search: ReactNode;
}) {
    return (
        <header className="k-path-bar">
            <nav className="k-path-bar__trail" aria-label="Path">
                <SiteFinder {...props} className="k-path-bar__place">
                    <PlaceIcon place={props.place} sites={props.sites} />
                    <span className="k-ellipsis">{placeLabelOf(props.place, props.sites)}</span>
                    <ChevronsUpDown {...ICON} className="k-path-bar__chevron" />
                </SiteFinder>
                {dashboard === false ? null : (
                    <>
                        <span className="k-path-bar__separator" aria-hidden="true">
                            /
                        </span>
                        {dashboard === undefined ? (
                            <span className="k-path-bar__step" aria-current="page">
                                Dashboard
                            </span>
                        ) : (
                            <a className="k-path-bar__step" href={dashboard}>
                                Dashboard
                            </a>
                        )}
                    </>
                )}
                {steps.map((step, index) => (
                    <span key={`${index}:${step.label}`} className="k-path-bar__step">
                        <span className="k-path-bar__separator" aria-hidden="true">
                            /
                        </span>
                        {step.href === undefined || index === steps.length - 1 ? (
                            <span className="k-ellipsis" aria-current={index === steps.length - 1 ? 'page' : undefined}>
                                {step.label}
                            </span>
                        ) : (
                            <a className="k-ellipsis" href={step.href}>
                                {step.label}
                            </a>
                        )}
                    </span>
                ))}
            </nav>
            {search}
        </header>
    );
}
