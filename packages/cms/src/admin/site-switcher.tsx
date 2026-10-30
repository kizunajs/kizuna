import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, ChevronsUpDown, Layers, Library, Search } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { AdminSite } from './config.js';
import { ALL_SITES, hrefIn, MANY_SITES, screenInSite, SHARED_GROUP, siteGroupsOf, type Screen } from './navigation.js';

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
function AllSitesIcon() {
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
 * The switcher at the top of the sidebar: the site shown, or All sites,
 * opening a list of every site the editor may open. An admin over every site
 * finds All sites first. With many sites the list takes a search and groups
 * them by country. Choosing one keeps the same kind of screen when that site
 * has one.
 */
export function SiteSwitcher({
    sites,
    shown,
    allSites,
    screen,
    onChoose,
}: {
    sites: readonly AdminSite[];
    /**
     * The site shown, or `undefined` for All sites.
     */
    shown: string | undefined;
    allSites: boolean;
    screen: Screen;
    onChoose: (site: string | undefined) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const current = sites.find((site) => site.key === shown);
    const groups = siteGroupsOf(sites, search);
    const choice = (site: AdminSite | undefined) => {
        const chosen = site?.key === current?.key;
        return (
            <a
                key={site?.key ?? ''}
                className="k-menu__item k-site-menu__item"
                href={hrefIn(site?.key, screenInSite(screen, site?.key))}
                aria-current={chosen ? 'true' : undefined}
                onClick={() => {
                    onChoose(site?.key);
                    setOpen(false);
                }}>
                {site === undefined ? <AllSitesIcon /> : <SiteIcon site={site} />}
                <span className="k-ellipsis">{site?.label ?? ALL_SITES}</span>
                {chosen ? (
                    <span className="k-menu__check">
                        <Check {...ICON} />
                    </span>
                ) : null}
            </a>
        );
    };
    // An editor of one site has nothing to switch to, so the site is a heading.
    if (sites.length === 1 && !allSites) {
        return (
            <div className="k-site-switcher" data-static="">
                <SiteIcon site={sites[0]} />
                <span className="k-site-switcher__label k-ellipsis">{sites[0]!.label}</span>
            </div>
        );
    }
    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setSearch('');
            }}>
            <Popover.Trigger className="k-site-switcher">
                {current === undefined ? <AllSitesIcon /> : <SiteIcon site={current} />}
                <span className="k-site-switcher__label k-ellipsis">{current?.label ?? ALL_SITES}</span>
                <ChevronsUpDown {...ICON} className="k-site-switcher__chevron" />
            </Popover.Trigger>
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
 * site the editor may open. The tab chosen is what the form edits.
 */
export function SiteTabs({
    documentRef,
    sites,
    current,
}: {
    documentRef: string;
    sites: readonly AdminSite[];
    current: string | undefined;
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
        </a>
    );
    return (
        <nav className="k-site-tabs" aria-label="Values">
            {tab(undefined)}
            {sites.map((site) => tab(site))}
        </nav>
    );
}
