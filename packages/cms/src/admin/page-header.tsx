import { Fragment, isValidElement, type ReactNode } from 'react';
import { hasSites, trailStart } from './navigation.js';

/**
 * One step of the trail back from a screen: its label, and where it leads.
 */
export interface Crumb {
    label: string;
    href?: string;
}

/**
 * One fact in the header's line given as a label and its value, like
 * "Status Draft changes".
 */
export interface MetaPair {
    label: string;
    value: ReactNode;
}

const isPair = (fact: unknown): fact is MetaPair =>
    typeof fact === 'object' && fact !== null && !isValidElement(fact) && 'label' in fact && 'value' in fact;

/**
 * The header every screen opens with: the trail back to it, its title with
 * its actions on the right, a line of facts about it, and its tabs. The
 * trail starts at the dashboard, or with several sites at the site open or
 * Shared, and ends on the title, so a screen passes
 * only the steps between them. The dashboard passes no `crumbs` and shows no
 * trail.
 *
 * Facts given as labelled pairs read "Status Draft changes", spaced apart.
 * Plain facts read in one muted line with dots between them. Tabs take a row
 * of their own under the facts, closed by a hairline.
 */
export function PageHeader({
    crumbs,
    title,
    meta,
    actions,
    tabs,
}: {
    /**
     * The steps between the dashboard and the title. Left out on the
     * dashboard, which has no trail.
     */
    crumbs?: readonly Crumb[];
    title: string;
    /**
     * Facts about the screen, like a count or when it last changed.
     */
    meta?: readonly (ReactNode | MetaPair)[];
    actions?: ReactNode;
    tabs?: ReactNode;
}) {
    // With several sites the path bar above the screen holds the trail.
    const trail = crumbs === undefined || hasSites() ? undefined : [trailStart(), ...crumbs];
    const facts = (meta ?? []).filter((fact) => fact !== null && fact !== undefined && fact !== false && fact !== '');
    const pairs = facts.length > 0 && facts.every(isPair);
    return (
        <header className="k-page-header" data-trail={trail === undefined ? undefined : ''} data-tabs={tabs === undefined ? undefined : ''}>
            {trail === undefined ? null : (
                <nav className="k-page-header__nav" aria-label="Breadcrumb">
                    <ol className="k-page-header__trail">
                        {trail.map((crumb, index) => (
                            <Fragment key={`${index}:${crumb.label}`}>
                                <li className="k-page-header__crumb">
                                    {crumb.href === undefined ? crumb.label : <a href={crumb.href}>{crumb.label}</a>}
                                </li>
                                <li className="k-page-header__separator" aria-hidden="true">
                                    /
                                </li>
                            </Fragment>
                        ))}
                        {title === '' ? null : (
                            <li className="k-page-header__current k-ellipsis" aria-current="page">
                                {title}
                            </li>
                        )}
                    </ol>
                </nav>
            )}
            <h1 className="k-page-header__title">{title}</h1>
            {actions === undefined || actions === null ? null : <div className="k-page-header__actions">{actions}</div>}
            {facts.length === 0 ? null : pairs ? (
                <dl className="k-page-header__meta k-page-header__meta--pairs">
                    {(facts as MetaPair[]).map((fact) => (
                        <div key={fact.label} className="k-page-header__pair">
                            <dt>{fact.label}</dt>
                            <dd>{fact.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <div className="k-page-header__meta">
                    {facts.map((fact, index) => (
                        <span key={index}>{isPair(fact) ? `${fact.label} ${String(fact.value)}` : fact}</span>
                    ))}
                </div>
            )}
            {tabs === undefined ? null : <div className="k-page-header__bar">{tabs}</div>}
        </header>
    );
}
