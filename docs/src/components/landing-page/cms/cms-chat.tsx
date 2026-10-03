import { ArrowUp } from 'lucide-react';
import ClaudeLogo from '@/icons/Claude.svg';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import { FrontPageEditor } from './cms-editor-mock';
import styles from './cms-chat.module.css';

interface Point {
    title: string;
    text: string;
}

const points: Point[] = [
    {
        title: 'Ask, or type',
        text: 'The form and the model see each other’s changes the moment they save.',
    },
    {
        title: 'Saved as a draft',
        text: 'Every change saves a moment after you stop, as a draft only signed-in editors see.',
    },
    {
        title: 'Publishing asks first',
        text: 'Whether you click Publish or ask the model, nothing goes live until you confirm.',
    },
];

export function CmsChat() {
    return (
        <Section
            aside={<DocsLink href="/docs/cms/editing" />}
            title="Your content, edited by asking"
            description="Ask Claude for a change and the editor opens beside the answer, filling in as the model writes.">
            <div className={panel.panel}>
                <div className={styles.split}>
                    <Chat />
                    <FrontPageEditor />
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

function Chat() {
    return (
        <div className={styles.chat}>
            <div className={styles.titleBar}>
                <ClaudeLogo className={styles.titleIcon} aria-hidden />
                Friendlier hero title
            </div>

            <div className={styles.messages}>
                <p className={styles.user}>Shorten the hero title on the front page and make it friendlier.</p>

                <div className={styles.toolRow}>
                    <span className={styles.toolDot} />
                    Read Front Page, then updated its draft
                </div>

                <p className={styles.assistant}>
                    It now reads “Invoices that send themselves”. That’s saved as a draft, so the site hasn’t changed yet.
                </p>

                <p className={styles.user}>Looks good, publish it.</p>

                <div className={styles.approval}>
                    <p className={styles.approvalTitle}>Publish Front Page?</p>
                    <p className={styles.approvalText}>Everyone who visits the site sees the new heading.</p>
                    <div className={styles.approvalActions}>
                        <span className={styles.deny}>Deny</span>
                        <span className={styles.allow}>Allow</span>
                    </div>
                </div>
            </div>

            <div className={styles.composer}>
                <span className={styles.composerText}>Reply to Claude</span>
                <span className={styles.send}>
                    <ArrowUp aria-hidden />
                </span>
            </div>
        </div>
    );
}
