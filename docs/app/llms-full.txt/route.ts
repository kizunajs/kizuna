import { readFile } from 'node:fs/promises';
import { source } from '@/lib/source';
import { standardsMarkdown, type StandardGroup } from '@/lib/standards';

export const revalidate = false;

export async function GET() {
    const pages = source.getPages();

    const documents = await Promise.all(
        pages.map(async (page) => {
            if (!page.absolutePath) return undefined;
            const raw = (await readFile(page.absolutePath, 'utf8')).replace(
                /<StandardsTable group="(\w+)" \/>/g,
                (_, group: StandardGroup) => standardsMarkdown(group)
            );
            return `# ${page.data.title}\nSource: ${page.url}\n\n${raw}`;
        })
    );

    return new Response(documents.filter(Boolean).join('\n\n---\n\n'), {
        headers: {
            'content-type': 'text/plain; charset=utf-8',
        },
    });
}
