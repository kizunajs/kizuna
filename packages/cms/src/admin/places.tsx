import { useState, type ReactNode } from 'react';
import { ChevronsUpDown, Library, Search } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { AdminSite } from './config.js';
import {
    ALL_PLACE,
    ALL_SITES,
    MANY_SITES,
    SHARED_GROUP,
    SHARED_PLACE,
    hrefIn,
    samePlace,
    screenInPlace,
    sitePlace,
    type Place,
    type Screen,
} from './navigation.js';
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
    onPin: (site: string) => void;
}

/**
 * The places at the top of the sidebar: All sites for an admin over every
 * site, the editor's sites, and Shared, the one shown marked. With many
 * sites it lists the pinned ones and the site open, and All sites' count
 * opens the finder.
 */
export function PlacesList({ sites, place, allSites, screen, pinned, onPin }: PlaceProps) {
    const many = sites.length > MANY_SITES;
    const listed = many ? sites.filter((site) => pinned.has(site.key) || (place.kind === 'site' && place.site === site.key)) : sites;
    const link = (target: Place) => (
        <a
            key={target.kind === 'site' ? target.site : target.kind}
            className="k-sidebar__item k-place"
            href={hrefIn(target.kind === 'site' ? target.site : undefined, screenInPlace(screen, target))}
            aria-current={samePlace(target, place) ? 'page' : undefined}>
            <PlaceIcon place={target} sites={sites} />
            <span className="k-sidebar__label k-ellipsis">{placeLabelOf(target, sites)}</span>
        </a>
    );
    return (
        <div className="k-sidebar__group k-places">
            {allSites ? link(ALL_PLACE) : null}
            {listed.map((site) => link(sitePlace(site.key)))}
            {many ? (
                <SiteFinder
                    sites={sites}
                    place={place}
                    allSites={allSites}
                    screen={screen}
                    pinned={pinned}
                    onPin={onPin}
                    className="k-sidebar__item k-place">
                    <span className="k-site-icon" aria-hidden="true">
                        <Search {...ICON} />
                    </span>
                    <span className="k-sidebar__label k-ellipsis">{`All ${sites.length} sites`}</span>
                </SiteFinder>
            ) : null}
            {link(SHARED_PLACE)}
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
 * its dashboard, then the steps to the screen, and at its end who reads
 * what it shows.
 */
export function PathBar({
    dashboard,
    steps,
    reader,
    search,
    ...props
}: PlaceProps & {
    /**
     * The place's dashboard, which follows the place, or `undefined` on the
     * dashboard itself.
     */
    dashboard: string | undefined;
    steps: readonly PathStep[];
    reader: AdminSite | 'every site' | undefined;
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
            {reader === undefined ? null : (
                <p className="k-path-bar__reader">
                    <span className="k-path-bar__reader-label">Read by</span>
                    {reader === 'every site' ? (
                        'every site'
                    ) : (
                        <>
                            <SiteIcon site={reader} />
                            {reader.label}
                        </>
                    )}
                </p>
            )}
            {search}
        </header>
    );
}
