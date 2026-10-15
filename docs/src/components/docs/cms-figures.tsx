import { Chat } from '@/components/landing-page/cms/cms-chat';
import { FrontPageEditor } from '@/components/landing-page/cms/cms-editor-mock';
import { Preview, Publish } from '@/components/landing-page/cms/cms-on-page';
import panel from '@/components/landing-page/panel.module.css';
import styles from './cms-figures.module.css';

type Kind = 'chat' | 'preview' | 'publish';

/**
 * The editor as the landing page draws it, for the docs: beside the chat,
 * the preview with a field pointed at, and a page about to publish.
 */
export function EditorFigure({ kind }: { kind: Kind }) {
    return (
        <div className={`${panel.panel} ${styles.figure}`}>
            {kind === 'chat' ? (
                <div className={styles.split}>
                    <Chat />
                    <FrontPageEditor />
                </div>
            ) : kind === 'preview' ? (
                <Preview />
            ) : (
                <Publish />
            )}
        </div>
    );
}
