import { describe, expect, it } from 'vitest';
import { serverNameOf } from './chat.js';
import { maskedToken, mcpAddCommandOf } from './edit-in-chat.js';

const chat = {
    path: '/cms-api/mcp',
    name: 'plant-shop-content',
    oauth: false,
    token: 'k3j9x2m4q8w7e5r1',
};

describe('Edit in your chat', () => {
    it('writes the command that adds the MCP route to Claude Code', () => {
        expect(mcpAddCommandOf(chat, 'https://hagen.no', chat.token)).toBe(
            'claude mcp add --transport http plant-shop-content https://hagen.no/cms-api/mcp \\\n  --header "Authorization: Bearer k3j9x2m4q8w7e5r1"'
        );
    });

    it('hides a token but its last four characters', () => {
        expect(maskedToken(chat.token)).toBe('••••••••••••e5r1');
        expect(maskedToken(chat.token)).not.toContain('k3j9');
    });

    it("names the server after the MCP plugin's name", () => {
        expect(serverNameOf('Plant shop content')).toBe('plant-shop-content');
        expect(serverNameOf(undefined)).toBe('kizuna');
    });
});
