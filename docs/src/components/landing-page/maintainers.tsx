import { MapPin } from 'lucide-react';
import GithubIcon from '@/icons/Github.svg';
import styles from './maintainers.module.css';

interface Maintainer {
    name: string;
    title: string;
    role: string;
    country: string;
    github: string;
    note: string;
}

const maintainers: Maintainer[] = [
    {
        name: 'Sondre Ørland',
        title: 'Creator',
        role: 'Full-stack developer & UX/UI-designer',
        country: 'Norway',
        github: 'sondreorland',
        note: 'It solved a real problem for us. I hope it does the same for you, and there is a lot more coming.',
    },
];

export function Maintainers() {
    return (
        <>
            {maintainers.map((maintainer) => (
                <article key={maintainer.name} className={styles.person}>
                    <p className={styles.note}>{maintainer.note}</p>
                    <div className={styles.identity}>
                        <img
                            className={styles.avatar}
                            src={`https://github.com/${maintainer.github}.png?size=160`}
                            alt=""
                            width={48}
                            height={48}
                            loading="lazy"
                            decoding="async"
                        />
                        <div className={styles.identityText}>
                            <p className={styles.name}>{maintainer.name}</p>
                            <p className={styles.role}>{maintainer.role}</p>
                        </div>
                    </div>
                    <div className={styles.meta}>
                        <span>{maintainer.title}</span>
                        <span className={styles.divider} aria-hidden />
                        <span className={styles.metaItem}>
                            <MapPin className={styles.metaIcon} aria-hidden />
                            {maintainer.country}
                        </span>
                        <span className={styles.divider} aria-hidden />
                        <a className={styles.handle} href={`https://github.com/${maintainer.github}`} target="_blank" rel="noreferrer">
                            <GithubIcon className={styles.metaIcon} />
                            {maintainer.github}
                        </a>
                    </div>
                </article>
            ))}
        </>
    );
}
