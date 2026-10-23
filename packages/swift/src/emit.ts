export class SwiftWriter {
    private readonly lines: string[] = [];
    private depth = 0;

    line(text = ''): void {
        if (text === '') {
            this.lines.push('');
            return;
        }
        this.lines.push('    '.repeat(this.depth) + text);
    }

    block(opener: string, body: () => void): void {
        this.line(`${opener} {`);
        this.depth += 1;
        body();
        this.depth -= 1;
        this.line('}');
    }

    indent(body: () => void): void {
        this.depth += 1;
        body();
        this.depth -= 1;
    }

    /**
     * Swift ends a `///` line at a carriage return as well as a newline, so the
     * text is split on both and every line keeps its `///`.
     */
    docComment(text: string | undefined): void {
        if (!text) return;
        for (const segment of text.split(/\r\n|\r|\n/)) {
            this.line(`/// ${segment}`);
        }
    }

    blank(): void {
        if (this.lines.length === 0) return;
        if (this.lines[this.lines.length - 1] === '') return;
        this.lines.push('');
    }

    toString(): string {
        return this.lines.join('\n').replace(/\n+$/, '') + '\n';
    }
}

/**
 * What goes between the quotes of a one-line string literal. Escaping the
 * backslash also means nothing in the text can start an interpolation.
 */
export const stringContent = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

export const stringLiteral = (value: string): string => {
    return '"' + stringContent(value) + '"';
};
