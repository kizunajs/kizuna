import type { Metadata } from 'next';
import { ClosingCta } from '@/components/landing-page/closing-cta';
import { FeatureCards } from '@/components/landing-page/feature-cards';
import { Section } from '@/components/landing-page/section';
import { CmsAccess } from '@/components/landing-page/cms/cms-access';
import { CmsBoundaries } from '@/components/landing-page/cms/cms-boundaries';
import { CmsChat } from '@/components/landing-page/cms/cms-chat';
import { CmsAlpha, CmsHero } from '@/components/landing-page/cms/cms-hero';
import { CmsKizuna } from '@/components/landing-page/cms/cms-kizuna';
import { CmsLimits } from '@/components/landing-page/cms/cms-limits';
import { CmsLocalization } from '@/components/landing-page/cms/cms-localization';
import { CmsOnPage } from '@/components/landing-page/cms/cms-on-page';
import { CmsRelationships } from '@/components/landing-page/cms/cms-relationships';
import { CmsReviews } from '@/components/landing-page/cms/cms-reviews';
import { CmsRichText } from '@/components/landing-page/cms/cms-rich-text';
import { CmsSearch } from '@/components/landing-page/cms/cms-search';
import { CmsSetup } from '@/components/landing-page/cms/cms-setup';
import { CmsSites } from '@/components/landing-page/cms/cms-sites';
import { CmsViews } from '@/components/landing-page/cms/cms-views';
import { cmsFeatures } from '@/lib/cms-features';
import styles from '../page.module.css';

export const metadata: Metadata = {
    title: 'Kizuna CMS',
    description: 'Declare the fields beside the route. Get the editor in your chat, the preview, a typed content API, and more.',
};

export default function CmsPage() {
    return (
        <div className={styles.page}>
            <CmsHero className={styles.hero} />

            <CmsAlpha className={styles.beta} />

            <Section className={styles.cards}>
                <FeatureCards features={cmsFeatures} />
            </Section>

            <div className={styles.sections}>
                <CmsKizuna />

                <CmsChat />

                <CmsOnPage />

                <CmsRelationships />

                <CmsRichText />

                <CmsLimits />

                <CmsAccess />

                <CmsReviews />

                <CmsLocalization />

                <CmsSites />

                <CmsSearch />

                <CmsViews />

                <CmsBoundaries />

                <CmsSetup />

                <ClosingCta
                    title="Hand the words to your editors"
                    text="Declare the fields, connect the chat, and let the people who write the site change it."
                    href="/docs/cms/quickstart"
                />
            </div>
        </div>
    );
}
