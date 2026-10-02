import { marked } from 'marked';

export function Article({ markdown }: { markdown: string }) {
    return <article dangerouslySetInnerHTML={{ __html: marked(markdown) }} />;
}
