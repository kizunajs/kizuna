import type { Exchange } from './sandbox';

const reasons: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    404: 'Not Found',
    500: 'Internal Server Error',
};

const shownRequestHeaders = new Set(['authorization', 'content-type']);

function pretty(body: string) {
    try {
        return JSON.stringify(JSON.parse(body), null, 4);
    } catch {
        return body.trimEnd();
    }
}

export function toHttp(exchanges: Exchange[]) {
    return exchanges
        .map((exchange) => {
            const lines = [`${exchange.method} ${exchange.path} HTTP/1.1`];
            for (const [name, value] of exchange.requestHeaders) {
                if (shownRequestHeaders.has(name)) lines.push(`${name}: ${value}`);
            }
            if (exchange.requestBody) lines.push('', exchange.requestBody);
            lines.push(' ', `HTTP/1.1 ${exchange.status} ${reasons[exchange.status] ?? ''}`.trimEnd());
            for (const [name, value] of exchange.responseHeaders) lines.push(`${name}: ${value}`);
            if (exchange.responseBody) lines.push('', pretty(exchange.responseBody));
            return lines.join('\n');
        })
        .join('\n \n');
}
