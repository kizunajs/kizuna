import { Chat } from '@/components/landing-page/cms/cms-chat';
import { FrontPageEditor } from '@/components/landing-page/cms/cms-editor-mock';
import { Preview, Publish } from '@/components/landing-page/cms/cms-on-page';
import { Ask, Review } from '@/components/landing-page/cms/cms-reviews';
import { FanOut, SearchResult, SharedItem, SharedReview, Switcher, Switchers } from './cms-flows';
import panel from '@/components/landing-page/panel.module.css';
import styles from './cms-figures.module.css';

type Kind =
    | 'chat'
    | 'preview'
    | 'publish'
    | 'ask'
    | 'review'
    | 'switchers'
    | 'switcher-admin'
    | 'switcher-country'
    | 'shared-item'
    | 'shared-review'
    | 'fan-out'
    | 'search-result';

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
            ) : kind === 'publish' ? (
                <Publish />
            ) : kind === 'ask' ? (
                <Ask />
            ) : kind === 'review' ? (
                <Review />
            ) : kind === 'switchers' ? (
                <Switchers />
            ) : kind === 'switcher-admin' ? (
                <Switcher as="admin" />
            ) : kind === 'switcher-country' ? (
                <Switcher as="country" />
            ) : kind === 'shared-item' ? (
                <SharedItem />
            ) : kind === 'shared-review' ? (
                <SharedReview />
            ) : kind === 'fan-out' ? (
                <FanOut />
            ) : (
                <SearchResult />
            )}
        </div>
    );
}
