import { useState, type ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, Layers, Library, Pin, Search } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { AdminSite } from './config.js';
import {
    ALL_PLACE,
    ALL_SITES,
    SHARED_PLACE,
    hrefIn,
    MANY_SITES,
    samePlace,
    screenInPlace,
    SHARED_GROUP,
    siteGroupsOf,
    siteMarkOf,
    sitePlace,
    type Place,
    type Screen,
} from './navigation.js';

/**
 * A site's mark: its own icon, or its code in a grey tile when another site
 * uses the same icon, or the shared content's for `undefined`.
 */
export function SiteIcon({ site }: { site: AdminSite | undefined }) {
    if (site === undefined) {
        return (
            <span className="k-site-icon" aria-hidden="true">
                <Library {...ICON} />
            </span>
        );
    }
    const mark = siteMarkOf(site);
    if ('code' in mark) {
        return (
            <span className="k-site-icon k-site-icon--code" data-length={mark.code.length} aria-hidden="true">
                {mark.code}
            </span>
        );
    }
    return <img className="k-site-icon" src={mark.icon} alt="" width={20} height={20} />;
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
 * Overview' mark in the switcher.
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
 * The finder of every place the editor may open: a search, Overview for an
 * admin over every site, the sites, and Shared, the one shown ticked. With
 * many sites it lists the pinned and recently opened ones and folds the rest
 * by country. A pin beside each site keeps it among the pinned.
 */
export function SiteFinder({
    sites,
    place,
    allSites,
    screen,
    pinned,
    recent,
    onPin,
    className,
    children,
}: {
    sites: readonly AdminSite[];
    place: Place;
    allSites: boolean;
    screen: Screen;
    pinned: ReadonlySet<string>;
    /**
     * The sites opened lately, newest first.
     */
    recent: readonly string[];
    onPin: (site: string) => void;
    className: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [country, setCountry] = useState<string | undefined>();
    const many = sites.length > MANY_SITES;
    const choice = (target: Place, detail?: string) => {
        const site = target.kind === 'site' ? sites.find((candidate) => candidate.key === target.site) : undefined;
        const chosen = samePlace(target, place);
        return (
            <div key={target.kind === 'site' ? target.site : target.kind} className="k-site-menu__row">
                <a
                    className="k-menu__item k-site-menu__item"
                    href={hrefIn(site?.key, screenInPlace(screen, target))}
                    aria-current={chosen ? 'true' : undefined}
                    onClick={() => setOpen(false)}>
                    {target.kind === 'all' ? <AllSitesIcon /> : <SiteIcon site={site} />}
                    <span className="k-ellipsis">{target.kind === 'all' ? ALL_SITES : (site?.label ?? SHARED_GROUP)}</span>
                    {chosen ? (
                        <span className="k-menu__check">
                            <Check {...ICON} />
                        </span>
                    ) : detail === undefined ? null : (
                        <span className="k-site-menu__detail">{detail}</span>
                    )}
                </a>
                {site === undefined || !many ? null : (
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
    const heading = (label: string) => <p className="k-site-menu__country">{label}</p>;
    const siteChoice = (site: AdminSite, detail?: string) => choice(sitePlace(site.key), detail);
    const countryOf = (site: AdminSite): string | undefined =>
        site.country === null || site.country === undefined ? undefined : countryName(site.country);
    const body = (() => {
        if (search.trim() !== '') {
            const groups = siteGroupsOf(sites, search);
            if (groups.every((group) => group.sites.length === 0)) return <p className="k-site-menu__none">No site matches.</p>;
            return groups.map((group) => (
                <div key={group.country ?? ''} role="group">
                    {group.country === undefined ? null : heading(countryName(group.country))}
                    {group.sites.map((site) => siteChoice(site))}
                </div>
            ));
        }
        if (!many) return sites.map((site) => siteChoice(site));
        const pinnedSites = sites.filter((site) => pinned.has(site.key));
        const recentSites = recent
            .map((key) => sites.find((site) => site.key === key))
            .filter((site): site is AdminSite => site !== undefined && !pinned.has(site.key));
        const countries = [...new Set(sites.map((site) => site.country ?? undefined).filter((code): code is string => code !== undefined))];
        return (
            <>
                {pinnedSites.length === 0 ? null : (
                    <div role="group">
                        {heading('Pinned')}
                        {pinnedSites.map((site) => siteChoice(site))}
                    </div>
                )}
                {recentSites.length === 0 ? null : (
                    <div role="group">
                        {heading('Recent')}
                        {recentSites.map((site) => siteChoice(site, countryOf(site)))}
                    </div>
                )}
                {countries.length === 0 ? null : (
                    <div role="group">
                        {heading('By country')}
                        {countries.map((code) => (
                            <div key={code}>
                                <button
                                    type="button"
                                    className="k-menu__item k-site-menu__item"
                                    aria-expanded={country === code}
                                    onClick={() => setCountry(country === code ? undefined : code)}>
                                    <span className="k-ellipsis">{countryName(code)}</span>
                                    <span className="k-site-menu__detail">{sites.filter((site) => site.country === code).length}</span>
                                </button>
                                {country === code ? sites.filter((site) => site.country === code).map((site) => siteChoice(site)) : null}
                            </div>
                        ))}
                    </div>
                )}
            </>
        );
    })();
    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) {
                    setSearch('');
                    setCountry(undefined);
                }
            }}>
            <Popover.Trigger className={className}>{children}</Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={6} className="k-positioner">
                    <Popover.Popup className="k-popup k-menu k-site-menu" aria-label="Places">
                        <label className="k-site-menu__search">
                            <Search {...ICON} />
                            <input
                                className="k-site-menu__input"
                                value={search}
                                placeholder="Find a site"
                                aria-label="Find a site"
                                autoFocus
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </label>
                        {allSites && search.trim() === '' ? choice(ALL_PLACE) : null}
                        {body}
                        {search.trim() === '' ? (
                            <>
                                <div className="k-account-menu__separator" role="separator" />
                                {choice(SHARED_PLACE)}
                            </>
                        ) : null}
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
