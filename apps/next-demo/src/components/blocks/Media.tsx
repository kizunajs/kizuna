import type { Output } from '@kizunajs/cms';
import type { MediaBlockSchema } from '../../cms/blocks';
import { sizedImage } from '../../lib/image';
import { Section } from '../Section';
import styles from './Media.module.css';

const WIDTH = 1600;
const HEIGHT = 800;

export function Media({ image, caption }: Output<typeof MediaBlockSchema>) {
    return (
        <Section>
            <figure className={styles.figure}>
                <img className={styles.image} src={sizedImage(image.url, WIDTH, HEIGHT)} alt={image.alt} width={WIDTH} height={HEIGHT} />
                {caption === undefined ? null : <figcaption className={styles.caption}>{caption}</figcaption>}
            </figure>
        </Section>
    );
}
