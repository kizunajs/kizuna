import type { Output } from '@kizunajs/cms';
import type { HeroBlockSchema } from './blocks';

export function Hero(props: Output<typeof HeroBlockSchema>) {
    return <section dangerouslySetInnerHTML={{ __html: props.heading }} />;
}

export function Other({ html }: { html: string }) {
    return <section dangerouslySetInnerHTML={{ __html: html }} />;
}
