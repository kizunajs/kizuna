export type StandardGroup = 'http' | 'openapi' | 'authentication' | 'mcp';

export interface Standard {
    group: StandardGroup;
    /**
     * The link text a docs table shows, such as `RFC 9110`.
     */
    cite: string;
    /**
     * What follows the link, such as `HTTP Semantics`.
     */
    title?: string;
    href: string;
    /**
     * What Kizuna takes from the standard. Backticks mark inline code.
     */
    covers: string;
    /**
     * Set on the standards the landing page shows as tiles.
     */
    tile?: {
        body: string;
        number: string;
        name: string;
    };
}

export const standards: Standard[] = [
    {
        group: 'http',
        cite: 'RFC 9110',
        title: 'HTTP Semantics',
        href: 'https://www.rfc-editor.org/rfc/rfc9110',
        covers: 'Methods, status codes, headers, content negotiation, and which methods are safe and idempotent',
    },
    {
        group: 'http',
        cite: 'RFC 5789',
        title: 'PATCH Method',
        href: 'https://www.rfc-editor.org/rfc/rfc5789',
        covers: 'The `PATCH` method, which RFC 9110 does not define, and its unsafe and non-idempotent semantics',
    },
    {
        group: 'http',
        cite: 'RFC 9457',
        title: 'Problem Details',
        href: 'https://www.rfc-editor.org/rfc/rfc9457',
        covers: 'The body of every error response, as `type`, `title`, `status`, `detail`, and `instance`',
        tile: {
            body: 'RFC',
            number: '9457',
            name: 'Problem Details errors',
        },
    },
    {
        group: 'http',
        cite: 'RFC 3986',
        title: 'URI Syntax',
        href: 'https://www.rfc-editor.org/rfc/rfc3986',
        covers: 'Percent-encoding of path parameters, and exact path matching, so `/users/1` and `/users/1/` are distinct resources',
    },
    {
        group: 'http',
        cite: 'RFC 8594',
        title: 'Sunset Header',
        href: 'https://www.rfc-editor.org/rfc/rfc8594',
        covers: 'The `Sunset` response header and the `sunset` link relation, announcing when a route will be removed and where its retirement policy lives',
        tile: {
            body: 'RFC',
            number: '8594',
            name: 'Sunset dates',
        },
    },
    {
        group: 'http',
        cite: 'RFC 9745',
        title: 'Deprecation Header',
        href: 'https://www.rfc-editor.org/rfc/rfc9745',
        covers: 'The `Deprecation` response header and the `deprecation` link relation, carrying the date a route became deprecated and a link to its documentation',
        tile: {
            body: 'RFC',
            number: '9745',
            name: 'Deprecation headers',
        },
    },
    {
        group: 'http',
        cite: 'RFC 9111',
        title: 'HTTP Caching',
        href: 'https://www.rfc-editor.org/rfc/rfc9111',
        covers: "The `Cache-Control` and `Vary` response headers a response's `cache` policy sends",
        tile: {
            body: 'RFC',
            number: '9111',
            name: 'Cache-Control and Vary',
        },
    },
    {
        group: 'http',
        cite: 'RFC 5861',
        title: 'Stale Content',
        href: 'https://www.rfc-editor.org/rfc/rfc5861',
        covers: 'The `stale-while-revalidate` and `stale-if-error` cache directives',
    },
    {
        group: 'http',
        cite: 'RFC 8246',
        title: 'Immutable Responses',
        href: 'https://www.rfc-editor.org/rfc/rfc8246',
        covers: 'The `immutable` cache directive',
    },
    {
        group: 'http',
        cite: 'RFC 9110',
        title: 'Conditional Requests',
        href: 'https://www.rfc-editor.org/rfc/rfc9110',
        covers: "The `ETag` a response's `etag` sends, the `If-None-Match` it is compared against, and the `304 Not Modified` a match answers with",
        tile: {
            body: 'RFC',
            number: '9110',
            name: 'ETag and 304 responses',
        },
    },
    {
        group: 'http',
        cite: 'Server-sent events',
        title: 'WHATWG HTML',
        href: 'https://html.spec.whatwg.org/multipage/server-sent-events.html',
        covers: "The `text/event-stream` framing of a route's `stream` response: `event`, `data`, `id`, `retry`, and comment lines",
        tile: {
            body: 'WHATWG',
            number: 'SSE',
            name: 'Typed event streams',
        },
    },
    {
        group: 'openapi',
        cite: 'OpenAPI 3.1.0',
        href: 'https://spec.openapis.org/oas/v3.1.0',
        covers: 'The document `@kizunajs/openapi` generates from your routes',
        tile: {
            body: 'OpenAPI',
            number: '3.1',
            name: 'Generated from your routes',
        },
    },
    {
        group: 'authentication',
        cite: 'OAuth 2.1',
        href: 'https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1',
        covers: 'The resource server model Kizuna implements',
        tile: {
            body: 'OAuth',
            number: '2.1',
            name: 'Resource server',
        },
    },
    {
        group: 'authentication',
        cite: 'RFC 9728',
        title: 'Protected Resource Metadata',
        href: 'https://www.rfc-editor.org/rfc/rfc9728',
        covers: 'The discovery document served at `/.well-known/oauth-protected-resource`',
        tile: {
            body: 'RFC',
            number: '9728',
            name: 'Discovery document',
        },
    },
    {
        group: 'authentication',
        cite: 'RFC 8414',
        title: 'Authorization Server Metadata',
        href: 'https://www.rfc-editor.org/rfc/rfc8414',
        covers: "An identity's `issuer`",
    },
    {
        group: 'authentication',
        cite: 'RFC 8707',
        title: 'Resource Indicators',
        href: 'https://www.rfc-editor.org/rfc/rfc8707',
        covers: 'The canonical `resource` URI, and the audience a guard checks a token against',
    },
    {
        group: 'authentication',
        cite: 'RFC 6750',
        title: 'Bearer Token Usage',
        href: 'https://www.rfc-editor.org/rfc/rfc6750',
        covers: 'The `WWW-Authenticate` challenge, including `insufficient_scope`',
        tile: {
            body: 'RFC',
            number: '6750',
            name: 'Scope challenges',
        },
    },
    {
        group: 'mcp',
        cite: 'Model Context Protocol',
        href: 'https://modelcontextprotocol.io/specification/latest',
        covers: 'The MCP endpoint, its tools, and their input and output schemas',
        tile: {
            body: 'Protocol',
            number: 'MCP',
            name: 'Tools a model can call',
        },
    },
    {
        group: 'mcp',
        cite: 'MCP authorization',
        href: 'https://modelcontextprotocol.io/specification/latest/basic/authorization',
        covers: 'Serving the endpoint as an OAuth 2.1 resource server',
    },
];

/**
 * One count per specification, so RFC 9110 counts once though two rows cite it.
 */
export const specificationCount = new Set(standards.map((standard) => standard.href)).size;

/**
 * The group's table as markdown, for `llms-full.txt`, which serves each page's
 * source rather than its rendered components.
 */
export function standardsMarkdown(group: StandardGroup) {
    const rows = standards
        .filter((standard) => standard.group === group)
        .map((standard) => {
            const cite = `[${standard.cite}](${standard.href})${standard.title ? ` ${standard.title}` : ''}`;
            return `| ${cite} | ${standard.covers} |`;
        });
    return ['| Standard | What it covers |', '| --- | --- |', ...rows].join('\n');
}
