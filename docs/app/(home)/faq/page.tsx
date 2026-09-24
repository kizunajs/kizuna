import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Faq } from '@/components/landing-page/faq';
import { PageHead } from '@/components/landing-page/page-head';
import GithubIcon from '@/icons/Github.svg';
import styles from '../subpage.module.css';

export const metadata: Metadata = {
    title: 'FAQ',
    description: 'Answers to common questions about Kizuna.js.',
};

export default function FaqPage() {
    return (
        <div className={styles.page}>
            <div className={styles.split}>
                <PageHead
                    className={styles.splitHead}
                    align="start"
                    label="FAQ"
                    title="Frequently asked questions"
                    description="Answers to common questions about Kizuna. For anything else, open an issue on GitHub.">
                    <ButtonLink href="https://github.com/kizunajs/kizuna/issues/new" variant="secondary" size="small">
                        <GithubIcon />
                        Open an issue
                    </ButtonLink>
                </PageHead>
                <Faq />
            </div>
        </div>
    );
}
