'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Lock, ShieldCheck, UserRound } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import editor from './cms-editor.module.css';
import { FormSection, Help, Row, Shell, TextInput } from './cms-editor-mock';
import styles from './cms-access.module.css';

type Role = 'editor' | 'admin';

const roles: {
    key: Role;
    label: string;
    icon: typeof UserRound;
}[] = [
    {
        key: 'editor',
        label: 'Signed in as an editor',
        icon: UserRound,
    },
    {
        key: 'admin',
        label: 'Signed in as an admin',
        icon: ShieldCheck,
    },
];

const pageCode = `export default definePage({
    name: 'investorsPage',
    requireReview: true,
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
        },
        {
            name: 'disclaimer',
            schema: z.string().max(400),
            auth: {
                roles: 'admin',
            },
        },
    ],
});`;

interface Point {
    title: string;
    text: string;
}

const points: Point[] = [
    {
        title: 'Roles from your sign-in',
        text: 'Editors sign in your way, and the roles come from your own users.',
    },
    {
        title: 'Down to the field',
        text: 'A field names the roles or permissions that may change it.',
    },
    {
        title: 'The model too',
        text: 'A write the editor can’t make, the model can’t either. It gets a 403.',
    },
];

export function CmsAccess() {
    const [role, setRole] = useState<Role>('editor');
    const isAdmin = role === 'admin';

    return (
        <Section
            aside={<DocsLink href="/docs/access-control" />}
            title="Your editors, by role"
            description="Say in code who may change what. The rule holds in the form, for the model and in the API.">
            <div className={panel.panel}>
                <div className={styles.split}>
                    <CodeWindow lang="ts" code={pageCode} title="src/app/investors/content.ts" />

                    <div className={styles.preview}>
                        <div className={styles.roles} role="tablist" aria-label="Who is editing">
                            {roles.map((candidate) => (
                                <button
                                    key={candidate.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={candidate.key === role}
                                    onClick={() => setRole(candidate.key)}
                                    className={clsx(panel.tab, candidate.key === role && panel.tabActive)}>
                                    <candidate.icon aria-hidden />
                                    {candidate.label}
                                </button>
                            ))}
                        </div>

                        <Shell title="Investor Relations" status="Unpublished changes">
                            <FormSection>
                                <Row label="Heading">
                                    <TextInput value="Results for the third quarter" max={60} />
                                </Row>
                                <Row label="Disclaimer">
                                    <div className={styles.locked}>
                                        <TextInput
                                            value="Figures are unaudited until the annual report."
                                            max={isAdmin ? 400 : undefined}
                                            multiline
                                            disabled={!isAdmin}
                                        />
                                        {isAdmin ? null : <Lock className={editor.icon} aria-hidden />}
                                    </div>
                                    {isAdmin ? null : <Help>Only admins can change this.</Help>}
                                </Row>
                            </FormSection>
                            <div className={editor.footer}>
                                <span className={editor.help}>
                                    {isAdmin ? 'Admins approve any page.' : 'This page needs a review before it goes live.'}
                                </span>
                                <span className={clsx(editor.button, editor.primary)}>{isAdmin ? 'Publish' : 'Ask for review'}</span>
                            </div>
                        </Shell>
                    </div>
                </div>

                <div className={styles.points}>
                    {points.map((point) => (
                        <div key={point.title} className={panel.body}>
                            <h3 className={panel.title}>{point.title}</h3>
                            <p className={panel.text}>{point.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}
