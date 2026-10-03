import clsx from 'clsx';
import { ArrowRight, ArrowUp, Monitor, Send, Smartphone, Tablet } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import ClaudeLogo from '@/icons/Claude.svg';
import Logo from '@/icons/Logo.svg';
import { Section } from '../section';
import panel from '../panel.module.css';
import chat from './cms-chat.module.css';
import editor from './cms-editor.module.css';
import { Editor } from './cms-editor-mock';
import styles from './cms-views.module.css';

export function CmsViews() {
    return (
        <Section
            title={
                <>
                    <span className={styles.soon}>Coming soon</span>
                    Your own views, in the chat
                </>
            }
            aside={
                <div className={styles.links}>
                    <ButtonLink href="/docs/resend#react-email" variant="secondary">
                        React Email
                        <ArrowRight aria-hidden />
                    </ButtonLink>
                    <ButtonLink href="/docs/resend#newsletters" variant="secondary">
                        Resend broadcasts
                        <ArrowRight aria-hidden />
                    </ButtonLink>
                </div>
            }
            description="Give a collection a view of its own. Write a newsletter with Claude, see it as the email, and send it through Resend.">
            <div className={panel.panel}>
                <div className={chat.split}>
                    <Chat />
                    <NewsletterView />
                </div>
            </div>
        </Section>
    );
}

function Chat() {
    return (
        <div className={chat.chat}>
            <div className={chat.titleBar}>
                <ClaudeLogo className={chat.titleIcon} aria-hidden />
                October newsletter
            </div>

            <div className={chat.messages}>
                <p className={chat.user}>Draft this month’s newsletter from the three newest articles.</p>

                <div className={chat.toolRow}>
                    <span className={chat.toolDot} />
                    Read 3 articles, then drafted Issue 12
                </div>

                <p className={chat.assistant}>Issue 12 is ready. It goes to the weekly list, 2,481 people, when you send it.</p>

                <p className={chat.user}>Send it.</p>

                <div className={chat.approval}>
                    <p className={chat.approvalTitle}>Send Issue 12?</p>
                    <p className={chat.approvalText}>It goes to 2,481 people on the weekly list.</p>
                    <div className={chat.approvalActions}>
                        <span className={chat.deny}>Deny</span>
                        <span className={chat.allow}>Allow</span>
                    </div>
                </div>
            </div>

            <div className={chat.composer}>
                <span className={chat.composerText}>Reply to Claude</span>
                <span className={chat.send}>
                    <ArrowUp aria-hidden />
                </span>
            </div>
        </div>
    );
}

function NewsletterView() {
    return (
        <Editor className={editor.shell}>
            <div className={editor.header}>
                <Logo className={editor.logo} aria-hidden />
                <div className={editor.title}>
                    <span className={editor.crumb}>Newsletter</span>
                    <span className={editor.crumbSeparator}>/</span>
                    <span className={editor.titleName}>Issue 12</span>
                    <span className={editor.status}>Draft</span>
                </div>
                <span className={editor.link}>weekly · 2,481</span>
            </div>

            <div className={editor.previewBar}>
                <span className={editor.help}>Preview</span>
                <div className={editor.tabs}>
                    <span className={editor.tab}>
                        <Monitor aria-hidden />
                        Desktop
                    </span>
                    <span className={editor.tab}>
                        <Tablet aria-hidden />
                        Tablet
                    </span>
                    <span className={clsx(editor.tab, editor.tabActive)}>
                        <Smartphone aria-hidden />
                        Phone
                    </span>
                </div>
            </div>

            <div className={clsx(editor.stage, styles.stage)}>
                <div className={styles.phone}>
                    <div className={styles.email}>
                        <img className={styles.hero} src="/cms/team-at-laptops.jpg" alt="" />
                        <div className={styles.content}>
                            <span className={styles.eyebrow}>Issue 12 · October</span>
                            <p className={styles.emailHeading}>Kizuna 2.0 is here</p>
                            <div className={styles.rich}>
                                <p>
                                    Hi there, <strong>2.0 is stable</strong>. Handlers live on the route, and every client reads from one
                                    config. The <span className={styles.richLink}>migration guide</span> walks through each step.
                                </p>
                                <div className={styles.launch}>
                                    <Logo className={styles.launchLogo} aria-hidden />
                                    <span className={styles.launchTitle}>Kizuna CMS</span>
                                    <span className={styles.launchText}>Editors change your site by asking. Now in alpha.</span>
                                    <span className={styles.launchButton}>Try it</span>
                                </div>
                                <h3>Upgrade in three steps</h3>
                                <ol>
                                    <li>
                                        Install <code>kizunajs@2</code>
                                    </li>
                                    <li>
                                        Run <code>kizuna diff</code> against main
                                    </li>
                                    <li>Fix what it flags, then ship</li>
                                </ol>
                                <div className={styles.callout}>
                                    <strong>Heads up.</strong> <em>Node 24</em> is now the minimum.
                                </div>
                                <h3>Come say hi</h3>
                                <div className={styles.event}>
                                    <span className={styles.eventDate}>
                                        <span>Nov</span>
                                        <strong>12</strong>
                                    </span>
                                    <span className={styles.eventBody}>
                                        <strong>Oslo meetup</strong>
                                        <span>Talks, pizza and a 2.0 demo</span>
                                    </span>
                                    <span className={styles.eventButton}>RSVP</span>
                                </div>
                            </div>
                            <p className={styles.unsubscribe}>Unsubscribe</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className={editor.footer}>
                <span className={clsx(editor.button, editor.secondary)}>Send me a test</span>
                <span className={clsx(editor.button, editor.primary)}>
                    <Send aria-hidden />
                    Send to weekly
                </span>
            </div>
        </Editor>
    );
}
