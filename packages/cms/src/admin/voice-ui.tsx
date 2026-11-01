import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { Hint } from '../view/hint.js';
import type { GlossaryTerm } from '../glossary.js';

/**
 * A glossary row as one line: its forms, and what it asks.
 */
export const termLineOf = (term: GlossaryTerm): string => {
    const forms = term.forms.join(', ');
    const where = term.language === undefined || term.language === '' ? '' : ` in ${term.language}`;
    if (term.rule === 'keep') return `${forms}, kept as written`;
    if (term.rule === 'translate') return `${forms}, written ${term.use ?? forms}${where}`;
    return term.use === undefined || term.use === '' ? `${forms}, avoided${where}` : `${forms}, avoided${where} for ${term.use}`;
};

const GROUP_REASON = "From the group's voice on Shared";

/**
 * The group's published glossary rows, which a site's voice adds to, for a
 * site's Voice to show locked above its own.
 */
export const useGroupTerms = (connection: Connection, site: string | undefined): GlossaryTerm[] | undefined => {
    const [terms, setTerms] = useState<GlossaryTerm[] | undefined>();
    useEffect(() => {
        setTerms(undefined);
        if (site === undefined) return;
        let current = true;
        void connection.call<{ glossary: Array<GlossaryTerm & { from: string }> }>('editing_voice', {}).then((answer) => {
            if (!current || answer.status !== 200) return;
            setTerms(answer.body.glossary.filter((term) => term.from === 'group'));
        });
        return () => {
            current = false;
        };
    }, [connection, site]);
    return terms;
};

/**
 * The group's rows, locked, above a site's own glossary.
 */
export function GroupTerms({ terms }: { terms: readonly GlossaryTerm[] }) {
    if (terms.length === 0) return null;
    return (
        <div className="k-group-terms">
            {terms.map((term) => (
                <p key={`${term.rule}:${term.forms.join(',')}:${term.language ?? ''}`} className="k-read-only">
                    <span className="k-read-only__text">{termLineOf(term)}</span>
                    <Hint label={GROUP_REASON}>
                        <span className="k-read-only__lock" role="img" aria-label={GROUP_REASON} tabIndex={0}>
                            <Lock size={13} strokeWidth={1.75} aria-hidden />
                        </span>
                    </Hint>
                </p>
            ))}
        </div>
    );
}
