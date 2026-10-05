import type { ApiDefinition } from 'kizunajs';
import { walkApi } from 'kizunajs/generator';

/**
 * A group problem `kizuna routes` fails on.
 */
export interface GroupProblem {
    /**
     * `empty`: a group holds no routes. `ungrouped`: a route is in no group.
     */
    kind: 'empty' | 'ungrouped';
    message: string;
}

const within = (path: string, group: string): boolean => path === group || path.startsWith(`${group}.`);

/**
 * Every group problem in an api. Hidden and plugin routes are skipped.
 */
export const checkGroups = (api: ApiDefinition): GroupProblem[] => {
    const declared = api.groups?.groups;
    if (declared === undefined || declared.size === 0) return [];

    const problems: GroupProblem[] = [];
    const filed: string[] = [];

    walkApi(api, {
        processRoute({ routeKey, routeGroups, hidden, plugin }) {
            if (plugin !== undefined || hidden) return;
            const group = routeGroups[0];
            if (group === undefined) {
                problems.push({
                    kind: 'ungrouped',
                    message: `${routeKey} is in no group. Declare it with k.routes.<group>(...).`,
                });
                return;
            }
            filed.push(...routeGroups);
        },
        finalize: () => undefined,
    });

    for (const group of declared.values()) {
        if (filed.some((path) => within(path, group.path))) continue;
        problems.push({
            kind: 'empty',
            message: `The group ${group.path} holds no routes. Remove it, or file a route in it.`,
        });
    }

    return problems;
};

/**
 * The problems, for the terminal.
 */
export const formatGroupProblems = (problems: readonly GroupProblem[]): string =>
    [
        `${problems.length} group ${problems.length === 1 ? 'problem' : 'problems'}:`,
        ...problems.map((problem) => `  ${problem.message}`),
    ].join('\n');
