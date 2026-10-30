import { describe, expect, it } from 'vitest';
import { refreshLineOf, type Refresh } from './refresh-line.js';

const site = (label: string, status: Refresh['status']): Refresh => ({
    target: label.toLowerCase(),
    kind: 'site',
    label,
    status,
    attempts: status === 'queued' ? 0 : 1,
});

const travelAgency: Refresh = {
    target: 'travelAgency',
    kind: 'partner',
    label: 'Travel agency',
    status: 'answered',
    attempts: 1,
};

describe('refreshLineOf', () => {
    it('counts the sites and partners a publish refreshed', () => {
        expect(
            refreshLineOf([site('Hagen Group', 'answered'), site('Hagen UK', 'answered'), site('Hagen Norge', 'answered'), travelAgency])
        ).toBe('Refreshed 3 sites and 1 partner.');
    });

    it('names a site that did not answer and is tried again', () => {
        expect(
            refreshLineOf([site('Hagen Group', 'answered'), site('Hagen UK', 'answered'), site('Hagen Norge', 'retrying'), travelAgency])
        ).toBe('Refreshed 2 of 3 sites and 1 partner. Hagen Norge did not answer, retrying.');
    });

    it('names those that failed for good, and those still waiting', () => {
        expect(refreshLineOf([site('Hagen UK', 'failed'), site('Hagen Norge', 'queued')])).toBe(
            'Refreshed 0 of 2 sites. Hagen UK did not answer. Hagen Norge has not answered yet.'
        );
    });

    it('says nothing when nothing was refreshed', () => {
        expect(refreshLineOf([])).toBeUndefined();
    });
});
