import type { AdminSite } from './config.js';
import { SiteIcon } from './site-switcher.js';
import type { FieldInput } from '../view/form.js';

/**
 * The sites an item's `showsOn` holds after one is turned on or off.
 */
export const toggledSites = (value: unknown, site: string): string[] => {
    const held = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
    return held.includes(site) ? held.filter((entry) => entry !== site) : [...held, site];
};

/**
 * An item's Shows on: a toggle for each site the editor opens.
 */
export function ShowsOn({ sites, input }: { sites: readonly AdminSite[]; input: FieldInput }) {
    const held = Array.isArray(input.value) ? input.value : [];
    return (
        <div className="k-shows-on" role="group" aria-label="Shows on">
            {sites.map((site) => (
                <button
                    key={site.key}
                    type="button"
                    className="k-shows-on__site"
                    aria-pressed={held.includes(site.key)}
                    disabled={input.disabled}
                    onClick={() => input.onChange(toggledSites(input.value, site.key))}>
                    <SiteIcon site={site} />
                    {site.label}
                </button>
            ))}
        </div>
    );
}
