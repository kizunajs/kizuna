import type * as PageTree from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';
import { Card, Cards } from './cards';

function findGuidesFolder(nodes: PageTree.Node[]): PageTree.Folder | undefined {
    for (const node of nodes) {
        if (node.type !== 'folder') continue;
        if (node.index?.url === '/docs/guides') return node;
        const nested = findGuidesFolder(node.children);
        if (nested) return nested;
    }
}

/**
 * Every guide, in the order the sidebar lists them.
 */
export function GuideList() {
    const folder = findGuidesFolder(source.pageTree.children);
    const guides = (folder?.children ?? [])
        .filter((node) => node.type === 'page')
        .map((node) => source.getPage(node.url.split('/').slice(2)))
        .filter((page) => page !== undefined);

    return (
        <Cards>
            {guides.map((page) => (
                <Card key={page.url} title={page.data.title} href={page.url} description={page.data.description} />
            ))}
        </Cards>
    );
}
