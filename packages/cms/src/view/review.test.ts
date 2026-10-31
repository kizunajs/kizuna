import { describe, expect, it } from 'vitest';
import { holderOf } from './review.js';

const people = {
    me: 'kari@hagen.example.com',
    people: [
        {
            id: 'kari@hagen.example.com',
            name: 'Kari Nordmann',
        },
        {
            id: 'edda@hagen.example.com',
            name: 'Edda Berg',
        },
    ],
};

describe('holderOf', () => {
    it('names someone else editing the document by their first name', () => {
        expect(holderOf('edda@hagen.example.com', people)).toBe('Edda');
    });

    it('holds nothing back for the person themselves, or when nobody edits it', () => {
        expect(holderOf('kari@hagen.example.com', people)).toBeUndefined();
        expect(holderOf(null, people)).toBeUndefined();
    });

    it('waits for the people list before holding anything back', () => {
        expect(holderOf('edda@hagen.example.com', undefined)).toBeUndefined();
    });

    it('names someone the people list leaves out by their id', () => {
        expect(holderOf('ola@hagen.example.com', people)).toBe('ola@hagen.example.com');
    });
});
