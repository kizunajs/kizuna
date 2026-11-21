import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna as BaseKizuna } from './kizuna.js';
import type { KizunaConfigShape } from './configured.js';

type ReportNamesOf<Config> = Config extends {
    reports: {
        names: infer Names extends string;
    };
}
    ? Names
    : string;

interface ReportDefinition<Name extends string> {
    name: string;
    after?: Name;
}

class Kizuna<Config extends KizunaConfigShape = Record<string, never>> extends BaseKizuna<Config> {
    report(definition: ReportDefinition<ReportNamesOf<Config>>): ReportDefinition<ReportNamesOf<Config>> {
        return definition;
    }
}

interface Config {
    adapter: unknown;
    reports: {
        names: 'daily' | 'weekly';
    };
}

const k = new Kizuna<Config>();

test('a class that extends Kizuna checks a name against its entry in Config', () => {
    k.report({
        name: 'weekly',
        after: 'daily',
    });

    k.report({
        name: 'weekly',
        // @ts-expect-error 'dayly' is not a report
        after: 'dayly',
    });
});

test('a class that extends Kizuna keeps the routes typed by the same Config', () => {
    const getUser = k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: z.object({
                name: z.string(),
            }),
        },
    });

    expectTypeOf(getUser.method).toEqualTypeOf<'GET'>();
});

test('a class that extends Kizuna keeps the statics', () => {
    expectTypeOf(Kizuna.model).toEqualTypeOf(BaseKizuna.model);
});

test('a Config without the entry falls back to any name', () => {
    new Kizuna().report({
        name: 'weekly',
        after: 'anything',
    });
});
