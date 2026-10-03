import clsx from 'clsx';
import Link from 'next/link';
import { ArrowRight, ArrowUp, Check, Mail, Search } from 'lucide-react';
import ClaudeLogo from '@/icons/Claude.svg';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import editor from './cms-editor.module.css';
import { Editor } from './cms-editor-mock';
import styles from './cms-reviews.module.css';

interface Person {
    initials: string;
    name: string;
    owner?: boolean;
    chosen?: boolean;
}

const people: Person[] = [
    {
        initials: 'KN',
        name: 'Kari Nordmann',
        owner: true,
        chosen: true,
    },
    {
        initials: 'JB',
        name: 'Jonas Berg',
    },
    {
        initials: 'SL',
        name: 'Sara Lindqvist',
    },
];

function Avatar({ initials }: { initials: string }) {
    return (
        <span className={styles.avatar} aria-hidden>
            {initials}
        </span>
    );
}

function Ask() {
    return (
        <Editor className={editor.dialog}>
            <p className={editor.dialogTitle}>Ask for review</p>
            <p className={editor.help}>Each of them sees the request in the editor, and when they ask what is waiting for them.</p>

            <div className={styles.picker}>
                <div className={editor.search}>
                    <Search aria-hidden />
                    <span>Search people</span>
                </div>
                {people.map((person) => (
                    <div key={person.name} className={clsx(styles.person, person.chosen && styles.personChosen)}>
                        <Avatar initials={person.initials} />
                        <span className={styles.personName}>{person.name}</span>
                        {person.owner ? <span className={editor.status}>Owner</span> : null}
                        {person.chosen ? <Check className={styles.check} aria-hidden /> : null}
                    </div>
                ))}
            </div>

            <div className={clsx(editor.input, editor.textarea, styles.note)}>
                <span className={editor.value}>Can you check the quarter figures before Friday?</span>
            </div>

            <div className={editor.dialogActions}>
                <span className={editor.spacer} />
                <span className={clsx(editor.button, editor.secondary)}>Cancel</span>
                <span className={clsx(editor.button, editor.primary)}>Ask Kari</span>
            </div>
        </Editor>
    );
}

function Review() {
    return (
        <Editor className={editor.dialog}>
            <p className={editor.dialogTitle}>Publish 2 documents?</p>
            <p className={editor.help}>Ingrid asked you to review these.</p>

            <div className={styles.group}>
                <div className={styles.groupHead}>
                    <span className={styles.document}>Investor Relations</span>
                    <span className={styles.waiting}>
                        <Avatar initials="IS" />
                        Ingrid asked you to review
                    </span>
                </div>
                <p className={styles.quote}>Can you check the quarter figures before Friday?</p>
                <div className={editor.change}>
                    <div className={editor.changeBody}>
                        <p className={editor.changeLabel}>Heading</p>
                        <p className={editor.changeText}>
                            <del>Q3 results</del> <ins>Results for the third quarter</ins>
                        </p>
                    </div>
                </div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupHead}>
                    <span className={styles.document}>Front Page</span>
                </div>
                <div className={editor.change}>
                    <div className={editor.changeBody}>
                        <p className={editor.changeLabel}>Introduction</p>
                        <p className={editor.changeText}>
                            Create, send and chase invoices from one place, and get paid <del>faster</del> <ins>twice as fast</ins>.
                        </p>
                    </div>
                </div>
            </div>

            <div className={editor.dialogActions}>
                <span className={editor.spacer} />
                <span className={clsx(editor.button, editor.secondary)}>Request changes</span>
                <span className={clsx(editor.button, editor.primary)}>Approve all</span>
            </div>
        </Editor>
    );
}

export function CmsReviews() {
    return (
        <Section
            aside={<DocsLink href="/docs/cms/reviews" />}
            title="Your changes, reviewed"
            description="Ask a colleague to look before anything goes live. They approve in the editor, or from their chat.">
            <div className={panel.panel}>
                <div className={styles.split}>
                    <div className={styles.side}>
                        <p className={styles.sideTitle}>
                            <Avatar initials="IS" />
                            Ingrid asks
                        </p>
                        <Ask />
                    </div>
                    <div className={styles.side}>
                        <p className={styles.sideTitle}>
                            <Avatar initials="KN" />
                            Kari reviews
                        </p>
                        <Review />
                    </div>
                </div>

                <div className={styles.points}>
                    <article className={styles.point}>
                        <div className={styles.pointVisual}>
                            <div className={styles.miniChat}>
                                <span className={styles.miniTitle}>
                                    <ClaudeLogo aria-hidden />
                                    Claude
                                </span>
                                <p className={styles.miniUser}>What’s waiting for me?</p>
                                <p className={styles.miniAnswer}>
                                    Ingrid asked you to review <strong>Investor Relations</strong> and <strong>Front Page</strong>.
                                </p>
                                <span className={styles.miniComposer}>
                                    Reply to Claude
                                    <ArrowUp aria-hidden />
                                </span>
                            </div>
                        </div>
                        <div className={panel.body}>
                            <Link href="/docs/cms/reviews#asking-for-a-review" className={panel.title}>
                                Review from the chat
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={panel.text}>Ask the model what’s waiting, and approve everything at once.</p>
                        </div>
                    </article>

                    <article className={styles.point}>
                        <div className={styles.pointVisual}>
                            <Editor className={styles.notice}>
                                <span className={styles.noticeHead}>
                                    <Mail aria-hidden />
                                    Kizuna CMS · now
                                </span>
                                <p className={styles.noticeTitle}>Ingrid asked you to review Investor Relations</p>
                                <p className={styles.quote}>Can you check the quarter figures before Friday?</p>
                                <span className={clsx(editor.button, editor.secondary, editor.small)}>Open the page</span>
                            </Editor>
                        </div>
                        <div className={panel.body}>
                            <Link href="/docs/cms/reviews#asking-for-a-review" className={panel.title}>
                                Email or Slack
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={panel.text}>onReviewRequested tells reviewers wherever your team already works.</p>
                        </div>
                    </article>

                    <article className={styles.point}>
                        <div className={styles.pointVisual}>
                            <Editor className={styles.requested}>
                                <span className={styles.requestedHead}>
                                    <span className={editor.titleName}>Investor Relations</span>
                                    <span className={styles.waiting}>
                                        <Avatar initials="KN" />
                                        Changes requested
                                    </span>
                                </span>
                                <p className={styles.quote}>Use the audited figure from the annual report.</p>
                                <p className={editor.help}>Changes were requested. Ask for a new review once they are made.</p>
                            </Editor>
                        </div>
                        <div className={panel.body}>
                            <Link href="/docs/cms/reviews#requiring-a-review" className={panel.title}>
                                Nothing slips through
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={panel.text}>With requireReview, only an approval of the current draft lets it publish.</p>
                        </div>
                    </article>
                </div>
            </div>
        </Section>
    );
}
