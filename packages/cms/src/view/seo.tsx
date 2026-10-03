import type { ControlProps } from './controls.js';
import { useEditorContext } from './context.js';
import type { JsonSchema } from './schema.js';

interface Goal {
    min: number;
    max: number;
}

interface Goals {
    title: Goal;
    description: Goal;
}

const FALLBACK_GOALS: Goals = {
    title: {
        min: 30,
        max: 60,
    },
    description: {
        min: 70,
        max: 160,
    },
};

export const isSeo = (schema: JsonSchema): boolean => schema['x-kizuna'] === 'seo';

/**
 * Where a length sits against what search results show in full.
 */
const verdict = (length: number, goal: Goal): { state: 'empty' | 'short' | 'good' | 'long'; text: string } => {
    if (length === 0) {
        return {
            state: 'empty',
            text: `Aim for ${goal.min} to ${goal.max} characters`,
        };
    }
    if (length < goal.min) {
        return {
            state: 'short',
            text: `${goal.min - length} more to reach ${goal.min}`,
        };
    }
    if (length > goal.max) {
        return {
            state: 'long',
            text: `${length - goal.max} over, search results cut the rest`,
        };
    }
    return {
        state: 'good',
        text: 'Shows in full',
    };
};

/**
 * A bar that fills to the longest length shown in full: green while the
 * length is in range, red when it is too short or too long.
 */
function Meter({ length, goal, label }: { length: number; goal: Goal; label: string }) {
    const result = verdict(length, goal);
    return (
        <div className="k-meter" data-state={result.state}>
            <div
                className="k-meter-track"
                role="meter"
                aria-label={`${label} length`}
                aria-valuemin={0}
                aria-valuemax={goal.max}
                aria-valuenow={Math.min(length, goal.max)}
                aria-valuetext={result.text}>
                <span
                    className="k-meter-fill"
                    style={{
                        width: `${Math.min(100, (length / goal.max) * 100)}%`,
                    }}
                />
            </div>
            <div className="k-meter-text">
                <span>{result.text}</span>
                <span className="k-counter">
                    {length} / {goal.min}–{goal.max}
                </span>
            </div>
        </div>
    );
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/**
 * A page's title and description, shown as a search result, each measured
 * against what search results show in full.
 */
export function SeoControl({ schema, value, onChange, disabled }: ControlProps) {
    const { pageUrl } = useEditorContext();
    const goals = (schema['x-kizuna-goals'] as Goals | undefined) ?? FALLBACK_GOALS;
    const seo = (value ?? {}) as { title?: string; description?: string };
    const title = seo.title ?? '';
    const description = seo.description ?? '';
    const set = (key: 'title' | 'description', next: string): void =>
        onChange({
            ...seo,
            [key]: next,
        });
    const address = pageUrl === undefined ? undefined : new URL(pageUrl);
    return (
        <div className="k-seo">
            <div className="k-serp" aria-label="As a search result">
                {address !== undefined ? (
                    <span className="k-serp-url">
                        {address.host}
                        {address.pathname === '/' ? '' : address.pathname.split('/').join(' › ')}
                    </span>
                ) : null}
                <span className="k-serp-title">{title === '' ? 'Page title' : clip(title, goals.title.max)}</span>
                <span className="k-serp-description">
                    {description === '' ? 'A sentence or two about the page.' : clip(description, goals.description.max)}
                </span>
            </div>
            <div className="k-seo-field">
                <label className="k-row-label" htmlFor="seo-title">
                    Title
                </label>
                <input
                    id="seo-title"
                    className="k-input"
                    type="text"
                    value={title}
                    disabled={disabled}
                    onChange={(event) => set('title', event.target.value)}
                />
                <Meter length={title.length} goal={goals.title} label="Title" />
            </div>
            <div className="k-seo-field">
                <label className="k-row-label" htmlFor="seo-description">
                    Description
                </label>
                <textarea
                    id="seo-description"
                    className="k-input k-textarea k-seo-textarea"
                    value={description}
                    rows={3}
                    disabled={disabled}
                    onChange={(event) => set('description', event.target.value)}
                />
                <Meter length={description.length} goal={goals.description} label="Description" />
            </div>
        </div>
    );
}
