import { creditOf } from '../credit.js';
import { Avatar, Avatars } from '../view/people.js';
import type { PersonView } from '../view/schema.js';
import { sentenceOf } from './sections.js';

/**
 * A fact in the header that names people, their faces before their names,
 * as the Owner fact shows its owner: "Waiting for review by", the faces, then
 * "Kari Nordmann and Ola Berg".
 */
export function PeopleFact({ lead, people, via = null }: { lead: string; people: readonly PersonView[]; via?: string | null }) {
    return (
        <span className="k-fact-people">
            {lead}
            {people.length === 0 ? null : (
                <>
                    {people.length === 1 ? <Avatar person={people[0]!} /> : <Avatars people={people} />}
                    <span>{creditOf(sentenceOf(people.map((person) => person.name)), via)}</span>
                </>
            )}
        </span>
    );
}
