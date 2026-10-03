import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { features as kizunaFeatures, type Feature } from '@/lib/features';
import styles from './feature-cards.module.css';

export function FeatureCards({ features = kizunaFeatures }: { features?: Feature[] }) {
    return (
        <div className={styles.grid}>
            {features.map((feature) => (
                <Link key={feature.title} href={feature.href} className={styles.card}>
                    <span className={styles.head}>
                        <span className={styles.icons}>
                            {feature.icons.map((Icon, index) => (
                                <Icon key={index} className={styles.icon} />
                            ))}
                        </span>
                        <span className={styles.title}>{feature.title}</span>
                        <ArrowRight className={styles.arrow} aria-hidden />
                    </span>
                    <p className={styles.description}>{feature.description}</p>
                </Link>
            ))}
        </div>
    );
}
