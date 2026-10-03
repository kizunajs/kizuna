import clsx from 'clsx';
import Link from 'next/link';
import { ArrowRight, Hand, Monitor, MousePointer2, MousePointerClick, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { Section } from '../section';
import panel from '../panel.module.css';
import editor from './cms-editor.module.css';
import { Editor, Row, TextInput } from './cms-editor-mock';
import styles from './cms-on-page.module.css';

export function CmsOnPage() {
    return (
        <Section
            title="Your site, edited in place"
            description="Click any text or image in the preview and the form jumps to it. Nothing goes live until someone publishes.">
            <div className={styles.panels}>
                <article className={panel.panel}>
                    <div className={styles.visual}>
                        <Preview />
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/cms/editing#the-editor" className={panel.title}>
                            Click to edit
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>
                            The draft renders at desktop, tablet or phone width. Click a heading and the model knows which one you mean.
                        </p>
                    </div>
                </article>

                <article className={panel.panel}>
                    <div className={styles.visual}>
                        <Publish />
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/cms/reviews" className={panel.title}>
                            Review before it goes live
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>Publish lists every change word by word. Revert one, or ask a colleague to look first.</p>
                    </div>
                </article>
            </div>
        </Section>
    );
}

function Preview() {
    return (
        <Editor className={styles.window}>
            <div className={editor.previewBar}>
                <div className={editor.tabs}>
                    <span className={clsx(editor.tab, editor.tabActive)}>
                        <MousePointerClick aria-hidden />
                        Point
                    </span>
                    <span className={editor.tab}>
                        <Hand aria-hidden />
                        Browse
                    </span>
                </div>
                <div className={editor.tabs}>
                    <span className={clsx(editor.tab, editor.tabActive)}>
                        <Monitor aria-hidden />
                        <span className={styles.tabLabel}>Desktop</span>
                    </span>
                    <span className={editor.tab}>
                        <Tablet aria-hidden />
                        <span className={styles.tabLabel}>Tablet</span>
                    </span>
                    <span className={editor.tab}>
                        <Smartphone aria-hidden />
                        <span className={styles.tabLabel}>Phone</span>
                    </span>
                </div>
            </div>

            <div className={clsx(editor.stage, styles.stage)}>
                <div className={styles.site} aria-hidden>
                    <div className={styles.siteNav}>
                        <span className={styles.siteBrand}>Example</span>
                        <span className={styles.siteLinks}>
                            <span>Pricing</span>
                            <span>Blog</span>
                            <span>Team</span>
                        </span>
                    </div>
                    <div className={styles.siteHero}>
                        <div className={styles.siteCopy}>
                            <span className={styles.siteHeading}>
                                Invoices that send themselves
                                <MousePointer2 className={styles.cursor} />
                            </span>
                            <span className={styles.siteIntro}>
                                Create, send and chase invoices from one place, and get paid twice as fast.
                            </span>
                        </div>
                        <img className={styles.sitePhoto} src="/cms/team-at-laptops.jpg" alt="" />
                    </div>
                </div>

                <div className={styles.pointed}>
                    <Row label="Heading">
                        <TextInput value="Invoices that send themselves" max={60} mark="pointed" />
                    </Row>
                </div>
            </div>
        </Editor>
    );
}

function Publish() {
    return (
        <div className={clsx(styles.window, styles.dialogStage)}>
            <Editor className={editor.dialog}>
                <p className={editor.dialogTitle}>Publish Front Page?</p>
                <p className={editor.help}>2 changes go live for visitors when you publish.</p>

                <div className={editor.changes}>
                    <div className={editor.change}>
                        <div className={editor.changeBody}>
                            <p className={editor.changeLabel}>Heading</p>
                            <p className={editor.changeText}>
                                <del>The invoicing platform for modern, growing businesses</del> <ins>Invoices that send themselves</ins>
                            </p>
                        </div>
                        <span className={clsx(editor.button, editor.secondary, editor.small)}>
                            <Undo2 aria-hidden />
                            Revert
                        </span>
                    </div>
                    <div className={editor.change}>
                        <div className={editor.changeBody}>
                            <p className={editor.changeLabel}>Hero image</p>
                            <div className={editor.changeImages}>
                                <img src="/cms/office-corridor.jpg" alt="" />
                                <span>→</span>
                                <img src="/cms/team-at-laptops.jpg" alt="" />
                            </div>
                        </div>
                        <span className={clsx(editor.button, editor.secondary, editor.small)}>
                            <Undo2 aria-hidden />
                            Revert
                        </span>
                    </div>
                </div>

                <div className={editor.dialogActions}>
                    <span className={clsx(editor.button, editor.secondary, styles.revertAll)}>Revert all</span>
                    <span className={editor.spacer} />
                    <span className={clsx(editor.button, editor.secondary)}>Ask for review</span>
                    <span className={clsx(editor.button, editor.primary)}>Publish</span>
                </div>
            </Editor>
        </div>
    );
}
