import type { ShikiTransformer } from 'shiki';

export function deprecationTransformer(symbol: string, message: string, language: 'typescript' | 'swift' | 'kotlin'): ShikiTransformer {
    return {
        name: 'kizuna-deprecated',
        span(node, _line, _column, lineElement, token) {
            if (token.content.trim() !== symbol) return;
            if (language === 'swift') {
                lineElement.properties['data-warning'] = message;
                return;
            }
            node.properties['class'] = [node.properties['class'], 'kizuna-deprecated'].filter(Boolean).join(' ');
        },
    };
}
