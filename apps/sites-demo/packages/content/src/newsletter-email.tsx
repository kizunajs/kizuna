import type { CSSProperties } from 'react';
import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import type { Output } from '@kizunajs/cms';
import type { Newsletters } from './newsletters';
import { sites } from './sites';
import { EmailRichText } from './email-rich-text';
import { ArticleCard, ProductRows, type Article, type NewsletterLinked, type Product } from './email-blocks';
import { colors, fonts } from './email-theme';

/**
 * What the email shows of an issue.
 */
export type NewsletterContent = Pick<Output<typeof Newsletters>, 'subject' | 'preheader' | 'body'>;

/**
 * Who the email is for. A broadcast passes Resend's own placeholders, which
 * Resend fills in for each contact.
 */
export interface NewsletterRecipient {
    firstName: string;
    unsubscribeUrl?: string;
}

/**
 * The recipient of a broadcast: each contact's first name, or "there" for a
 * contact without one, and their own unsubscribe link.
 */
export const BROADCAST_RECIPIENT: NewsletterRecipient = {
    firstName: '{{{FIRST_NAME|there}}}',
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
};

const group = sites.values.group;

const styles = {
    body: {
        margin: 0,
        padding: '32px 0',
        backgroundColor: colors.paper,
    },
    container: {
        maxWidth: '600px',
        backgroundColor: colors.white,
    },
    masthead: {
        padding: '28px 40px 0',
    },
    wordmark: {
        margin: 0,
        fontFamily: fonts.serif,
        fontSize: '22px',
        lineHeight: '28px',
        color: colors.ink,
    },
    content: {
        padding: '24px 40px 16px',
    },
    subject: {
        margin: '0 0 24px',
        fontFamily: fonts.serif,
        fontSize: '36px',
        fontWeight: 400,
        lineHeight: '42px',
        color: colors.ink,
    },
    greeting: {
        margin: '0 0 16px',
        fontFamily: fonts.sans,
        fontSize: '16px',
        lineHeight: '26px',
        color: colors.ink,
    },
    footer: {
        padding: '32px 40px',
        backgroundColor: colors.forest,
    },
    company: {
        margin: '0 0 8px',
        fontFamily: fonts.serif,
        fontSize: '18px',
        lineHeight: '24px',
        color: colors.forestInk,
    },
    footerText: {
        margin: 0,
        fontFamily: fonts.sans,
        fontSize: '13px',
        lineHeight: '20px',
        color: colors.forestMuted,
    },
    footerLink: {
        color: colors.forestInk,
        textDecoration: 'underline',
    },
} satisfies Record<string, CSSProperties>;

/**
 * Hagen's newsletter in its sites' look: the name on white, the issue below,
 * and the company in a green band at the bottom.
 */
export function NewsletterEmail({
    newsletter,
    recipient,
    linked,
}: {
    newsletter: NewsletterContent;
    recipient: NewsletterRecipient;
    linked: NewsletterLinked;
}) {
    return (
        <Html lang="en">
            <Head />
            {newsletter.preheader === undefined || newsletter.preheader === '' ? null : <Preview>{newsletter.preheader}</Preview>}
            <Body style={styles.body}>
                <Container style={styles.container}>
                    <Section style={styles.masthead}>
                        <Text style={styles.wordmark}>{group.label}</Text>
                    </Section>
                    <Section style={styles.content}>
                        <Heading as="h1" style={styles.subject}>
                            {newsletter.subject}
                        </Heading>
                        <Text style={styles.greeting}>Hi {recipient.firstName},</Text>
                        <EmailRichText
                            value={newsletter.body}
                            siteUrl={group.url}
                            blocks={{
                                article: (props) => <ArticleCard article={linked.articles.get(props.article)} siteUrl={group.url} />,
                                product: (props) => (
                                    <ProductRows products={props.products.map((id) => linked.products.get(id))} siteUrl={group.url} />
                                ),
                            }}
                        />
                    </Section>
                    <Section style={styles.footer}>
                        <Text style={styles.company}>{group.companyName}</Text>
                        <Text style={styles.footerText}>
                            You get this email because you signed up for Hagen&rsquo;s weekly newsletter.{' '}
                            <Link href={recipient.unsubscribeUrl ?? group.url} style={styles.footerLink}>
                                Unsubscribe
                            </Link>
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

/**
 * The articles and plants an issue's blocks name, read the way the page reads
 * them, so Live Preview shows their drafts.
 */
const linkedOf = async (body: NewsletterContent['body']): Promise<NewsletterLinked> => {
    const articleIds = body.flatMap((node) => (node._type === 'article' ? [node.article] : []));
    const productIds = body.flatMap((node) => (node._type === 'product' ? node.products : []));
    // The config holds the newsletters, so it loads once an issue renders rather than with this file.
    const { default: kizuna } = await import('../kizuna.cms.config');
    const [articles, products]: [Article[], Product[]] = await Promise.all([
        articleIds.length === 0
            ? []
            : kizuna.content.collections.articles.getMany({
                  ids: articleIds,
              }),
        productIds.length === 0
            ? []
            : kizuna.content.collections.products.getMany({
                  ids: productIds,
              }),
    ]);
    return {
        articles: new Map(articles.map((article) => [article.id, article])),
        products: new Map(products.map((product) => [product.id, product])),
    };
};

/**
 * An issue as the HTML its recipients get, for Live Preview, the test email
 * and the broadcast alike.
 */
export const renderNewsletter = async (newsletter: NewsletterContent, recipient: NewsletterRecipient): Promise<string> =>
    render(<NewsletterEmail newsletter={newsletter} recipient={recipient} linked={await linkedOf(newsletter.body)} />);
