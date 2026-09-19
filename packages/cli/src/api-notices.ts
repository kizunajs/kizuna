import type { RouteDefinition } from '@ts-kizuna/core';
import { createGenerator } from '@ts-kizuna/core/generator';

/**
 * A route that announces its own retirement.
 */
export interface Notice {
    /**
     * `users.getUser`.
     */
    routeKey: string;
    method: string;
    path: string;
    deprecated: boolean;
    /**
     * What the route's `deprecated` says to use instead.
     */
    message?: string;
    /**
     * When it will be removed, ISO 8601, from the route's `sunset`.
     */
    sunset?: string;
    /**
     * Whole days until `sunset`, negative once it has passed.
     */
    daysUntilSunset?: number;
}

const readSunset = (route: RouteDefinition): string | undefined => {
    const declared = route.sunset;
    if (declared === undefined) return undefined;
    return typeof declared === 'string' ? declared : declared.date;
};

const daysBetween = (from: Date, to: Date): number => Math.ceil((to.getTime() - from.getTime()) / 86_400_000);

/**
 * Every route that is deprecated or has a sunset date, soonest first, with
 * undated deprecations last.
 *
 * Reads the same `deprecated` field `@ts-kizuna/typescript-plugin` reports in an
 * editor, so a watcher and a hover agree.
 */
export const apiNotices = createGenerator<{ now?: Date }, Notice[]>((options) => {
    const now = options.now ?? new Date();
    const notices: Notice[] = [];

    return {
        processRoute({ routeKey, route, deprecated, deprecationMessage }) {
            const sunset = readSunset(route);
            if (!deprecated && sunset === undefined) return;

            const sunsetDate = sunset === undefined ? undefined : new Date(sunset);
            const dated = sunsetDate !== undefined && !Number.isNaN(sunsetDate.getTime());

            notices.push({
                routeKey,
                method: route.method,
                path: route.path,
                deprecated,
                ...(deprecationMessage === undefined ? {} : { message: deprecationMessage }),
                ...(sunset === undefined ? {} : { sunset }),
                ...(dated ? { daysUntilSunset: daysBetween(now, sunsetDate) } : {}),
            });
        },
        finalize() {
            return notices.sort((left, right) => {
                if (left.daysUntilSunset === undefined) return right.daysUntilSunset === undefined ? 0 : 1;
                if (right.daysUntilSunset === undefined) return -1;
                return left.daysUntilSunset - right.daysUntilSunset;
            });
        },
    };
});

/**
 * One line per notice, for a watcher to print.
 *
 * @example
 * DELETE /users/:id  users.deleteUser  deprecated, sunset in 14 days
 */
export const formatNotice = (notice: Notice): string => {
    const parts: string[] = [];
    if (notice.deprecated) parts.push('deprecated');

    if (notice.daysUntilSunset !== undefined) {
        const days = notice.daysUntilSunset;
        if (days < 0) parts.push(`sunset ${Math.abs(days)} days ago`);
        else if (days === 0) parts.push('sunset today');
        else parts.push(`sunset in ${days} days`);
    } else if (notice.sunset !== undefined) {
        parts.push(`sunset ${notice.sunset}`);
    }

    const suffix = notice.message === undefined ? '' : `. ${notice.message}`;
    return `${notice.method} ${notice.path}  ${notice.routeKey}  ${parts.join(', ')}${suffix}`;
};
