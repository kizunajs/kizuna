import { Fragment, type ReactNode } from 'react';
import { hrefOf } from './navigation.js';

/**
 * One step of the trail back from a screen: its label, and where it leads.
 */
export interface Crumb {
    label: string;
    href?: string;
}

const DASHBOARD_CRUMB: Crumb = {
    label: 'Dashboard',
    href: hrefOf({
        kind: 'dashboard',
    }),
};

/**
 * The header every screen opens with: the trail back to it, its title, a
 * line of facts about it, and its actions. The trail starts at the dashboard
 * and ends on the title, so a screen passes only the steps between them, and
 * the dashboard itself passes none.
 *
 * The actions sit to the right of the title. Tabs take a row of their own
 * under it, closed by a hairline.
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
     * dashboard, whose trail is its title alone.
     */
    crumbs?: readonly Crumb[];
    title: string;
    /**
     * Facts about the screen, like a count or when it last changed, shown
     * in one muted line with dots between them.
     */
    meta?: readonly ReactNode[];
    actions?: ReactNode;
    tabs?: ReactNode;
}) {
    const trail = crumbs === undefined ? [] : [DASHBOARD_CRUMB, ...crumbs];
    const facts = (meta ?? []).filter((fact) => fact !== null && fact !== undefined && fact !== false && fact !== '');
    return (
        <header className="k-page-header" data-tabs={tabs === undefined ? undefined : ''}>
            <div className="k-page-header__top">
                <div className="k-page-header__main">
                    <nav aria-label="Breadcrumb">
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
                    <h1 className="k-page-header__title">{title}</h1>
                    {facts.length === 0 ? null : (
                        <div className="k-page-header__meta">
                            {facts.map((fact, index) => (
                                <span key={index}>{fact}</span>
                            ))}
                        </div>
                    )}
                </div>
                {actions === undefined || actions === null ? null : <div className="k-page-header__actions">{actions}</div>}
            </div>
            {tabs === undefined ? null : <div className="k-page-header__bar">{tabs}</div>}
        </header>
    );
}
