import { Fragment } from 'react';
import { standards, type StandardGroup } from '@/lib/standards';

function renderInline(text: string) {
    return text
        .split('`')
        .map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>));
}

/**
 * One group of the standards Kizuna follows, read from `src/lib/standards.ts`.
 */
export function StandardsTable({ group }: { group: StandardGroup }) {
    return (
        <div className="relative overflow-auto prose-no-margin my-6">
            <table>
                <thead>
                    <tr>
                        <th>Standard</th>
                        <th>What it covers</th>
                    </tr>
                </thead>
                <tbody>
                    {standards
                        .filter((standard) => standard.group === group)
                        .map((standard) => (
                            <tr key={`${standard.cite} ${standard.title ?? ''}`}>
                                <td>
                                    <a href={standard.href}>{standard.cite}</a>
                                    {standard.title ? ` ${standard.title}` : null}
                                </td>
                                <td>{renderInline(standard.covers)}</td>
                            </tr>
                        ))}
                </tbody>
            </table>
        </div>
    );
}
