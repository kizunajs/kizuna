import clsx from 'clsx';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb';
import { findNeighbour } from 'fumadocs-core/page-tree';
import { AnchorProvider } from 'fumadocs-core/toc';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { DocsToc } from '@/components/docs-shell/docs-toc';
import { getMDXComponents } from '@/components/docs/mdx-components';
import { source } from '@/lib/source';
import styles from './page.module.css';

interface PageProps {
    params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: PageProps) {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    const MDX = page.data.body;
    const toc = page.data.toc;
    const breadcrumb = getBreadcrumbItems(page.url, source.pageTree);
    const { previous, next } = findNeighbour(source.pageTree, page.url);

    return (
        <AnchorProvider toc={toc} single>
            <div className={clsx(styles.page, toc.length === 0 && styles.pageWithoutToc)}>
                <article className={styles.article}>
                    <header className={styles.hero}>
                        {breadcrumb.length > 1 ? (
                            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
                                {breadcrumb.map((item, index) => (
                                    <span key={index} className={styles.crumb}>
                                        {index > 0 ? <ChevronRight className={styles.crumbSeparator} aria-hidden /> : null}
                                        {item.url ? (
                                            <Link href={item.url} className={styles.crumbLink}>
                                                {item.name}
                                            </Link>
                                        ) : (
                                            item.name
                                        )}
                                    </span>
                                ))}
                            </nav>
                        ) : null}

                        <h1 className={styles.title}>{page.data.title}</h1>
                        {page.data.description ? <p className={styles.description}>{page.data.description}</p> : null}
                    </header>

                    <div className={clsx('prose kizuna-docs-content', styles.body)}>
                        <MDX components={getMDXComponents(defaultMdxComponents)} />
                    </div>

                    {previous || next ? (
                        <nav className={styles.neighbours} aria-label="More pages">
                            {previous ? (
                                <Link href={previous.url} className={styles.neighbour}>
                                    <span className={styles.neighbourLabel}>
                                        <ArrowLeft className={styles.neighbourIcon} aria-hidden />
                                        Previous
                                    </span>
                                    <span className={styles.neighbourName}>{previous.name}</span>
                                </Link>
                            ) : (
                                <span />
                            )}
                            {next ? (
                                <Link href={next.url} className={clsx(styles.neighbour, styles.neighbourNext)}>
                                    <span className={styles.neighbourLabel}>
                                        Next
                                        <ArrowRight className={styles.neighbourIcon} aria-hidden />
                                    </span>
                                    <span className={styles.neighbourName}>{next.name}</span>
                                </Link>
                            ) : null}
                        </nav>
                    ) : null}
                </article>

                {toc.length > 0 ? (
                    <aside className={styles.toc}>
                        <DocsToc toc={toc} />
                    </aside>
                ) : null}
            </div>
        </AnchorProvider>
    );
}

export async function generateStaticParams() {
    return source.generateParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const page = source.getPage(slug);
    if (!page) notFound();

    return {
        title: page.data.title,
        description: page.data.description,
    };
}
