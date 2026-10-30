import { useState, type ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, Layers, Library, Pin, Search } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { AdminSite } from './config.js';
import {
    ALL_PLACE,
    ALL_SITES,
    hrefIn,
    MANY_SITES,
    samePlace,
    screenInPlace,
    SHARED_GROUP,
    siteGroupsOf,
    sitePlace,
    type Place,
    type Screen,
} from './navigation.js';

/**
 * A site's icon, its label's first letter without one, or the shared
 * content's for `undefined`.
 */
export function SiteIcon({ site }: { site: AdminSite | undefined }) {
    if (site === undefined) {
        return (
            <span className="k-site-icon" aria-hidden="true">
                <Library {...ICON} />
            </span>
        );
    }
    if (site.icon === null) {
        return (
            <span className="k-site-icon k-site-icon--letter" aria-hidden="true">
                {site.label.charAt(0)}
            </span>
        );
    }
    return <img className="k-site-icon" src={site.icon} alt="" width={20} height={20} />;
}

/**
 * Who a document or list belongs to, for its header's Site: the site's icon
 * and label, or Shared.
 */
export function SiteFact({ site }: { site: AdminSite | undefined }) {
    return (
        <span className="k-site-fact">
            <SiteIcon site={site} />
            {site?.label ?? SHARED_GROUP}
        </span>
    );
}

/**
 * All sites' mark in the switcher.
 */
export function AllSitesIcon() {
    return (
        <span className="k-site-icon" aria-hidden="true">
            <Layers {...ICON} />
        </span>
    );
}

const countryNames = new Intl.DisplayNames(['en'], {
    type: 'region',
});

const countryName = (country: string): string => {
    try {
        return countryNames.of(country) ?? country;
    } catch {
        return country;
    }
};

/**
 * The finder of every site the editor may open: a search with many sites,
 * the sites grouped by country, and a pin beside each, which keeps it in the
 * sidebar's places. Choosing one keeps the same kind of screen when that site
 * has one. An admin over every site finds All sites first.
 */
export function SiteFinder({
    sites,
    place,
    allSites,
    screen,
    pinned,
    onPin,
    className,
    children,
}: {
    sites: readonly AdminSite[];
    place: Place;
    allSites: boolean;
    screen: Screen;
    /**
     * The sites the editor pinned, which a pin beside each toggles. Without
     * it the finder offers no pins.
     */
    pinned?: ReadonlySet<string>;
    onPin?: (site: string) => void;
    className: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const groups = siteGroupsOf(sites, search);
    const choice = (site: AdminSite | undefined) => {
        const target = site === undefined ? ALL_PLACE : sitePlace(site.key);
        const chosen = samePlace(target, place);
        return (
            <div key={site?.key ?? ''} className="k-site-menu__row">
                <a
                    className="k-menu__item k-site-menu__item"
                    href={hrefIn(site?.key, screenInPlace(screen, target))}
                    aria-current={chosen ? 'true' : undefined}
                    onClick={() => setOpen(false)}>
                    {site === undefined ? <AllSitesIcon /> : <SiteIcon site={site} />}
                    <span className="k-ellipsis">{site?.label ?? ALL_SITES}</span>
                    {chosen ? (
                        <span className="k-menu__check">
                            <Check {...ICON} />
                        </span>
                    ) : null}
                </a>
                {site === undefined || pinned === undefined || onPin === undefined ? null : (
                    <button
                        type="button"
                        className="k-icon-button k-site-menu__pin"
                        aria-pressed={pinned.has(site.key)}
                        aria-label={pinned.has(site.key) ? `Unpin ${site.label}` : `Pin ${site.label}`}
                        onClick={() => onPin(site.key)}>
                        <Pin {...ICON} />
                    </button>
                )}
            </div>
        );
    };
    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setSearch('');
            }}>
            <Popover.Trigger className={className}>{children}</Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={6} className="k-positioner">
                    <Popover.Popup className="k-popup k-menu k-site-menu" aria-label="Sites">
                        {sites.length <= MANY_SITES ? null : (
                            <label className="k-site-menu__search">
                                <Search {...ICON} />
                                <input
                                    className="k-site-menu__input"
                                    value={search}
                                    placeholder={`Find a site among ${sites.length}`}
                                    aria-label="Find a site"
                                    autoFocus
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </label>
                        )}
                        {allSites && search === '' ? (
                            <>
                                {choice(undefined)}
                                <div className="k-account-menu__separator" role="separator" />
                            </>
                        ) : null}
                        {groups.map((group) => (
                            <div
                                key={group.country ?? ''}
                                role="group"
                                aria-label={group.country === undefined ? undefined : countryName(group.country)}>
                                {group.country === undefined ? null : <p className="k-site-menu__country">{countryName(group.country)}</p>}
                                {group.sites.map((site) => choice(site))}
                            </div>
                        ))}
                        {groups.every((group) => group.sites.length === 0) ? <p className="k-site-menu__none">No site matches.</p> : null}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

/**
 * The tabs of a shared document that sites set values on: Shared, then each
 * site the editor may open, with how many values it sets itself. The tab
 * chosen is what the form edits.
 */
export function SiteTabs({
    documentRef,
    sites,
    current,
    counts = {},
}: {
    documentRef: string;
    sites: readonly AdminSite[];
    current: string | undefined;
    counts?: Readonly<Record<string, number>>;
}) {
    const tab = (site: AdminSite | undefined) => (
        <a
            key={site?.key ?? ''}
            className="k-tab k-site-tabs__tab"
            href={hrefIn(site?.key, {
                kind: 'document',
                ref: documentRef,
            })}
            aria-current={site?.key === current ? 'page' : undefined}>
            <SiteIcon site={site} />
            {site?.label ?? SHARED_GROUP}
            {site === undefined || (counts[site.key] ?? 0) === 0 ? null : (
                <span className="k-site-tabs__count" aria-label={`${counts[site.key]} values of its own`}>
                    {counts[site.key]}
                </span>
            )}
        </a>
    );
    return (
        <nav className="k-site-tabs" aria-label="Values">
            {tab(undefined)}
            {sites.map((site) => tab(site))}
        </nav>
    );
}
