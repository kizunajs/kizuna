import type { CSSProperties } from 'react';
import { Column, Img, Link, Row, Section, Text } from '@react-email/components';
import type { Output } from '@kizunajs/cms';
import type { Articles } from './articles';
import type { Products } from './products';
import { colors, fonts } from './email-theme';

export type Article = Output<typeof Articles>;

export type Product = Output<typeof Products>;

/**
 * The articles and plants an issue's blocks name, by id, which the email
 * reads what it shows of them from.
 */
export interface NewsletterLinked {
    articles: ReadonlyMap<string, Article>;
    products: ReadonlyMap<string, Product>;
}

const styles = {
    card: {
        margin: '8px 0 28px',
    },
    cardImage: {
        display: 'block',
        width: '100%',
        height: 'auto',
        marginBottom: '16px',
    },
    eyebrow: {
        margin: '0 0 6px',
        fontFamily: fonts.sans,
        fontSize: '12px',
        lineHeight: '16px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.inkFaint,
    },
    cardTitle: {
        margin: '0 0 8px',
        fontFamily: fonts.serif,
        fontSize: '22px',
        lineHeight: '28px',
        color: colors.ink,
    },
    cardSummary: {
        margin: '0 0 12px',
        fontFamily: fonts.sans,
        fontSize: '15px',
        lineHeight: '24px',
        color: colors.inkMuted,
    },
    link: {
        fontFamily: fonts.sans,
        fontSize: '15px',
        lineHeight: '24px',
        color: colors.forest,
        textDecoration: 'underline',
    },
    products: {
        margin: '8px 0 28px',
        borderTop: `1px solid ${colors.sage}`,
    },
    product: {
        borderBottom: `1px solid ${colors.sage}`,
    },
    productPhoto: {
        display: 'block',
        width: '88px',
        height: '88px',
        objectFit: 'cover',
    },
    productPhotoCell: {
        width: '88px',
        padding: '12px 16px 12px 0',
        verticalAlign: 'top',
    },
    productText: {
        padding: '12px 0',
        verticalAlign: 'top',
    },
    productName: {
        margin: '0 0 2px',
        fontFamily: fonts.serif,
        fontSize: '18px',
        lineHeight: '24px',
        color: colors.ink,
    },
    productPrice: {
        margin: '0 0 6px',
        fontFamily: fonts.sans,
        fontSize: '15px',
        lineHeight: '22px',
        color: colors.ink,
    },
    productSummary: {
        margin: '0 0 6px',
        fontFamily: fonts.sans,
        fontSize: '14px',
        lineHeight: '21px',
        color: colors.inkMuted,
    },
} satisfies Record<string, CSSProperties>;

/**
 * A link or image source as an inbox can follow it: a path on the site, like
 * `/journal`, joined to the site's address.
 */
export const absolute = (href: string, siteUrl: string): string => new URL(href, siteUrl).toString();

/**
 * An article from the journal as a card: its image, title and summary, with a
 * link to it on the journal. An article that is gone shows nothing.
 */
export function ArticleCard({ article, siteUrl }: { article: Article | undefined; siteUrl: string }) {
    if (article === undefined) return null;
    const href = absolute(`/journal#${article.id}`, siteUrl);
    return (
        <Section style={styles.card}>
            {article.image === undefined ? null : (
                <Link href={href}>
                    <Img src={absolute(article.image.url, siteUrl)} alt={article.image.alt} width={520} style={styles.cardImage} />
                </Link>
            )}
            <Text style={styles.eyebrow}>From the journal</Text>
            <Text style={styles.cardTitle}>{article.title}</Text>
            <Text style={styles.cardSummary}>{article.summary}</Text>
            <Link href={href} style={styles.link}>
                Read the article
            </Link>
        </Section>
    );
}

/**
 * A few plants, a row each: photo, name, price and summary, with a link to the
 * shops that sell them. Plants that are gone are left out.
 */
export function ProductRows({ products, siteUrl }: { products: Array<Product | undefined>; siteUrl: string }) {
    const shown = products.filter((product) => product !== undefined);
    if (shown.length === 0) return null;
    const shops = absolute('/offices', siteUrl);
    return (
        <Section style={styles.products}>
            {shown.map((product) => (
                <Row key={product.id} style={styles.product}>
                    <Column style={styles.productPhotoCell}>
                        <Link href={shops}>
                            <Img
                                src={absolute(product.photo.url, siteUrl)}
                                alt={product.photo.alt}
                                width={88}
                                height={88}
                                style={styles.productPhoto}
                            />
                        </Link>
                    </Column>
                    <Column style={styles.productText}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productPrice}>{product.price}</Text>
                        <Text style={styles.productSummary}>{product.summary}</Text>
                        <Link href={shops} style={styles.link}>
                            Find it in our shops
                        </Link>
                    </Column>
                </Row>
            ))}
        </Section>
    );
}
