import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Section } from './section';
import panel from './panel.module.css';
import { specificationCount, standards } from '@/lib/standards';
import styles from './standards.module.css';
import { DocsLink } from '@/components/landing-page/docs-link';

const tiles = standards.flatMap((standard) => (standard.tile ? [standard.tile] : []));

export function Standards() {
    return (
        <Section
            aside={<DocsLink href="/docs/standards" />}
            title="RFC-correct out of the box"
            description="Every status code, error body and header follows the RFC that defines it, without you reading a single spec.">
            <div className={panel.panel}>
                <ul className={styles.grid}>
                    {tiles.map((tile) => (
                        <li key={`${tile.body} ${tile.number}`} className={styles.tile}>
                            <span className={styles.body}>{tile.body}</span>
                            <span className={styles.number}>{tile.number}</span>
                            <span className={styles.name}>{tile.name}</span>
                        </li>
                    ))}
                    <li className={styles.tile}>
                        <span className={styles.body}>Specs</span>
                        <span className={styles.number}>+{specificationCount - tiles.length}</span>
                        <span className={styles.name}>And many more</span>
                    </li>
                </ul>

                <div className={panel.body}>
                    <Link href="/docs/standards" className={panel.title}>
                        Standards
                        <ArrowRight className={panel.arrow} aria-hidden />
                    </Link>
                    <p className={panel.text}>Every specification Kizuna follows, what each one covers, and what it leaves out.</p>
                </div>
            </div>
        </Section>
    );
}
