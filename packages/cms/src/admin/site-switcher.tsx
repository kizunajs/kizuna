import { Menu } from '@base-ui/react/menu';
import { Check, ChevronsUpDown, Library } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { AdminSite } from './config.js';
import { hrefIn, screenInSite, SHARED_GROUP, type Screen } from './navigation.js';

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
 * Every site's icon, overlapping, beside the heading of what they all read.
 */
export function SiteStack({ sites }: { sites: readonly AdminSite[] }) {
    return (
        <span className="k-site-stack" aria-hidden="true">
            {sites.map((site) => (
                <SiteIcon key={site.key} site={site} />
            ))}
        </span>
    );
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
 * The switcher at the top of the sidebar: the site shown, opening a menu of
 * every site the editor may open and the shared content. Choosing one keeps
 * the same kind of screen when that site has one.
 */
export function SiteSwitcher({ sites, screen }: { sites: readonly AdminSite[]; screen: Screen }) {
    const current = sites.find((site) => site.key === screen.site);
    const choice = (site: AdminSite | undefined) => {
        const chosen = site?.key === current?.key;
        return (
            <Menu.LinkItem
                key={site?.key ?? ''}
                className="k-menu__item k-site-menu__item"
                href={hrefIn(site?.key, screenInSite(screen, site?.key))}
                aria-current={chosen ? 'true' : undefined}
                closeOnClick>
                <SiteIcon site={site} />
                <span className="k-ellipsis">{site?.label ?? SHARED_GROUP}</span>
                {chosen ? (
                    <span className="k-menu__check">
                        <Check {...ICON} />
                    </span>
                ) : null}
            </Menu.LinkItem>
        );
    };
    return (
        <Menu.Root>
            <Menu.Trigger className="k-site-switcher">
                <SiteIcon site={current} />
                <span className="k-site-switcher__label k-ellipsis">{current?.label ?? SHARED_GROUP}</span>
                <ChevronsUpDown {...ICON} className="k-site-switcher__chevron" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner side="bottom" align="start" sideOffset={6} className="k-positioner">
                    <Menu.Popup className="k-popup k-menu k-site-menu">
                        {sites.map((site) => choice(site))}
                        <Menu.Separator className="k-account-menu__separator" />
                        {choice(undefined)}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
