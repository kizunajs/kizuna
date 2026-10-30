import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ICON } from '../view/context.js';
import { Avatar, type People } from '../view/people.js';
import { humanize } from '../view/schema.js';
import type { AdminSite } from './config.js';
import { hrefOf, SHARED_GROUP, siteGroupsOf } from './navigation.js';
import { PageHeader } from './page-header.js';
import { SiteIcon } from './site-switcher.js';
import { languageNameOf } from './translation-ui.js';
import { WaitingTable } from './waiting.js';
import { waitingRowsOf, type OpenReview, type OpenTranslation } from './waiting-rows.js';

/**
 * The key Sites gives the shared content beside the sites.
 */
export const SHARED_KEY = 'shared';

const countryNames = new Intl.DisplayNames(['en'], {
    type: 'region',
});

const nameOf = (names: Intl.DisplayNames, code: string): string => {
    try {
        return names.of(code) ?? code;
    } catch {
        return code;
    }
};

const hostOf = (url: string | undefined): string | undefined => {
    if (url === undefined) return undefined;
    try {
        return new URL(url).host;
    } catch {
        return undefined;
    }
};

/**
 * A person as the people route lists them, with their role on each site
 * when the app gives it.
 */
type Editor = People['people'][number] & {
    sites?: Readonly<Record<string, string | readonly string[]>>;
};

const roleText = (role: string | readonly string[]): string => (typeof role === 'string' ? [role] : role).map(humanize).join(', ');

/**
 * Sites: every site and the shared content in a list with what waits on
 * each, and the one chosen beside it, with its domain, languages, editors
 * and what waits on it.
 */
export function SitesScreen({
    sites,
    chosen,
    waiting,
    people,
    collectionLabel,
}: {
    sites: readonly AdminSite[];
    /**
     * The site chosen, `shared`, or `undefined` for the first site.
     */
    chosen: string | undefined;
    waiting: { reviews: OpenReview[]; translations: OpenTranslation[] } | undefined;
    people: People | undefined;
    collectionLabel: (name: string) => string | undefined;
}) {
    const [filter, setFilter] = useState('');
    const now = useMemo(() => new Date(), []);
    const rows = useMemo(
        () =>
            waiting === undefined
                ? []
                : waitingRowsOf(waiting.reviews, waiting.translations, {
                      collectionLabel,
                  }),
        [waiting, collectionLabel]
    );
    const key = chosen ?? sites[0]?.key ?? SHARED_KEY;
    const site = sites.find((candidate) => candidate.key === key);
    const waitingOn = (place: string): number => rows.filter((row) => (row.site ?? SHARED_KEY) === place).length;
    const groups = siteGroupsOf(sites, filter);
    const entry = (place: string, label: string, mark: AdminSite | undefined) => (
        <a
            key={place}
            className="k-sidebar__item k-sites__entry"
            href={hrefOf({
                kind: 'sites',
                key: place,
            })}
            aria-current={place === key ? 'page' : undefined}>
            <SiteIcon site={mark} />
            <span className="k-sidebar__label k-ellipsis">{label}</span>
            <span className="k-sites__count">{waitingOn(place)}</span>
        </a>
    );
    const editors = ((people?.people ?? []) as Editor[]).flatMap((person) => {
        const role = site === undefined ? person.roles : person.sites?.[site.key];
        return role === undefined || (Array.isArray(role) && role.length === 0)
            ? []
            : [
                  {
                      person,
                      role,
                  },
              ];
    });
    const knowsSites = ((people?.people ?? []) as Editor[]).some((person) => person.sites !== undefined);
    const shown = rows.filter((row) => (row.site ?? SHARED_KEY) === key);
    const domain = hostOf(site?.url);
    const languages = site?.locales?.map(languageNameOf).join(', ');
    return (
        <>
            <PageHeader
                title="Sites"
                meta={[
                    {
                        label: 'Total',
                        value: sites.length === 1 ? '1 site' : `${sites.length} sites`,
                    },
                ]}
            />
            <div className="k-admin__body k-sites">
                <nav className="k-sites__list" aria-label="Sites">
                    <label className="k-list-toolbar__search">
                        <Search {...ICON} />
                        <span className="k-visually-hidden">Filter sites</span>
                        <input
                            type="search"
                            value={filter}
                            placeholder={`Filter ${sites.length} sites`}
                            onChange={(event) => setFilter(event.target.value)}
                        />
                    </label>
                    {filter.trim() === '' ? entry(SHARED_KEY, SHARED_GROUP, undefined) : null}
                    {groups.map((group) => (
                        <div key={group.country ?? ''} className="k-sites__group" role="group">
                            {group.country === undefined ? null : (
                                <p className="k-heading">
                                    {nameOf(countryNames, group.country)} · {group.sites.length}
                                </p>
                            )}
                            {group.sites.map((candidate) => entry(candidate.key, candidate.label, candidate))}
                        </div>
                    ))}
                </nav>
                <section className="k-sites__chosen" aria-label={site?.label ?? SHARED_GROUP}>
                    <div className="k-sites__head">
                        <SiteIcon site={site} />
                        <div className="k-sites__title">
                            <h2 className="k-sites__name">{site?.label ?? SHARED_GROUP}</h2>
                            <dl className="k-page-header__meta k-page-header__meta--pairs">
                                {domain === undefined ? null : (
                                    <div className="k-page-header__pair">
                                        <dt>Domain</dt>
                                        <dd>{domain}</dd>
                                    </div>
                                )}
                                {languages === undefined ? null : (
                                    <div className="k-page-header__pair">
                                        <dt>{site?.locales?.length === 1 ? 'Language' : 'Languages'}</dt>
                                        <dd>{languages}</dd>
                                    </div>
                                )}
                            </dl>
                        </div>
                    </div>
                    {site === undefined || !knowsSites ? null : (
                        <>
                            <h3 className="k-heading k-sites__heading">
                                People <span className="k-sites__heading-count">{editors.length}</span>
                            </h3>
                            {editors.length === 0 ? null : (
                                <div className="k-table__scroll">
                                    <table className="k-table" aria-label="People">
                                        <thead>
                                            <tr>
                                                <th scope="col">Person</th>
                                                <th scope="col">Role</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {editors.map(({ person, role }) => (
                                                <tr key={person.id} className="k-table__row">
                                                    <td className="k-table__title">
                                                        <span className="k-site-fact">
                                                            <Avatar person={person} size={20} />
                                                            {person.name}
                                                        </span>
                                                    </td>
                                                    <td>{roleText(role)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                    <h3 className="k-heading k-sites__heading">
                        Waiting <span className="k-sites__heading-count">{shown.length}</span>
                    </h3>
                    {shown.length === 0 ? null : <WaitingTable rows={shown} sites={sites} where={false} now={now} />}
                </section>
            </div>
        </>
    );
}
