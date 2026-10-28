import type { Output } from '@kizunajs/cms';
import type { CallToActionBlockSchema } from '../../cms/blocks';
import { LinkButton } from '../LinkButton';
import { Section } from '../Section';
import styles from './CallToAction.module.css';

export function CallToAction({ heading, body, links }: Output<typeof CallToActionBlockSchema>) {
    return (
        <Section>
            <div className={styles.callToAction}>
                <div>
                    <h2 className={styles.heading}>{heading}</h2>
                    <p className={styles.body}>{body}</p>
                </div>
                <div className={styles.links}>
                    {links.map((link, index) => (
                        <LinkButton key={link.href} href={link.href} label={link.label} variant={index === 0 ? 'primary' : 'secondary'} />
                    ))}
                </div>
            </div>
        </Section>
    );
}
