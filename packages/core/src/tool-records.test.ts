import { describe, expect, it } from 'vitest';
import { readToolCalls } from './tool-records.js';

const call = (id: string, name: string, input?: unknown) => ({
    event: 'tool_call' as const,
    data: { id, name, input },
});

const result = (id: string, name: string, output?: unknown) => ({
    event: 'tool_result' as const,
    data: { id, name, output },
});

const failure = (id: string, name: string, message: string) => ({
    event: 'tool_error' as const,
    data: { id, name, message },
});

describe('readToolCalls', () => {
    it('folds a call and its result into one row', () => {
        expect(
            readToolCalls([
                call('toolu_01', 'weather.getForecast', { city: 'Oslo' }),
                result('toolu_01', 'weather.getForecast', { temperature: 14 }),
            ])
        ).toEqual([
            {
                id: 'toolu_01',
                name: 'weather.getForecast',
                state: 'done',
                input: { city: 'Oslo' },
                output: { temperature: 14 },
                message: undefined,
            },
        ]);
    });

    it('leaves a call with no result running, keeping its input', () => {
        const [tracked] = readToolCalls([call('toolu_01', 'weather.getForecast', { city: 'Oslo' })]);

        expect(tracked!.state).toBe('running');
        expect(tracked!.input).toEqual({ city: 'Oslo' });
        expect(tracked!.output).toBeUndefined();
    });

    it('marks a failed call and carries its message', () => {
        const [tracked] = readToolCalls([
            call('toolu_01', 'weather.getForecast', { city: 'Atlantis' }),
            failure('toolu_01', 'weather.getForecast', 'No station reports for that city.'),
        ]);

        expect(tracked!.state).toBe('failed');
        expect(tracked!.message).toBe('No station reports for that city.');
    });

    it('keeps one row per id, in the order the calls arrived', () => {
        const tracked = readToolCalls([
            call('toolu_01', 'weather.getForecast'),
            call('toolu_02', 'countWords'),
            result('toolu_02', 'countWords', { words: 3 }),
            result('toolu_01', 'weather.getForecast', { temperature: 14 }),
        ]);

        expect(tracked.map((entry) => entry.id)).toEqual(['toolu_01', 'toolu_02']);
    });

    it('answers a row for a result whose call never arrived, rather than throwing', () => {
        const tracked = readToolCalls([result('toolu_09', 'countWords', { words: 3 })]);

        expect(tracked).toEqual([
            {
                id: 'toolu_09',
                name: 'countWords',
                state: 'done',
                input: undefined,
                output: { words: 3 },
                message: undefined,
            },
        ]);
    });

    it('ignores the events it does not recognise', () => {
        expect(
            readToolCalls([
                { event: 'delta', data: { text: 'hello' } },
                call('toolu_01', 'countWords'),
                { event: 'done', data: { inputTokens: 1 } },
            ])
        ).toHaveLength(1);
    });

    it('ignores a tool event carrying no id', () => {
        expect(readToolCalls([{ event: 'tool_call', data: { name: 'countWords' } }])).toEqual([]);
    });

    it('answers nothing for an empty list', () => {
        expect(readToolCalls([])).toEqual([]);
    });
});
