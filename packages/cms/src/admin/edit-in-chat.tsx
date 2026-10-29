import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { Check, Copy, Eye, EyeOff, X } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { ChatConnection } from './config.js';

/**
 * What the command shows where the token goes when the app gives none.
 */
const TOKEN_PLACEHOLDER = '<token>';

/**
 * A token as the dialog shows it until the editor asks to see it: dots, and
 * its last four characters to tell it apart.
 */
export const maskedToken = (token: string): string => `${'•'.repeat(Math.max(4, Math.min(16, token.length - 4)))}${token.slice(-4)}`;

/**
 * The command that adds the CMS's MCP route to Claude Code, signed in with
 * the editor's token.
 */
export const mcpAddCommandOf = (chat: ChatConnection, origin: string, token: string): string =>
    `claude mcp add --transport http ${chat.name} ${origin}${chat.path} \\\n  --header "Authorization: Bearer ${token}"`;

/**
 * A button that copies text, and says so for a moment after.
 */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copied]);
    return (
        <button
            type="button"
            className="k-button k-button--secondary k-button--small k-chat__copy"
            onClick={() => {
                void window.navigator.clipboard?.writeText(text).then(() => setCopied(true));
            }}>
            {copied ? <Check {...ICON} /> : <Copy {...ICON} />}
            {copied ? 'Copied' : label}
        </button>
    );
}

/**
 * Edit in your chat: how to connect Claude to the CMS's MCP route as the
 * signed-in editor. Claude Code takes a command with the editor's token,
 * hidden until they show it, and Claude's own apps take the route's address
 * as a connector.
 */
export function EditInChat({
    open,
    onOpenChange,
    chat,
    editorName,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    chat: ChatConnection;
    editorName: string | undefined;
}) {
    const [revealed, setRevealed] = useState(false);
    const origin = window.location.origin;
    const address = `${origin}${chat.path}`;
    const token = chat.token ?? TOKEN_PLACEHOLDER;
    const shownToken = chat.token === null || revealed ? token : maskedToken(chat.token);
    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) setRevealed(false);
            }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-chat">
                    <div className="k-dialog__head">
                        <div className="k-chat__intro">
                            <Dialog.Title className="k-dialog__title">Edit in your chat</Dialog.Title>
                            <Dialog.Description className="k-dialog__detail">
                                Connect Claude to this site’s content. Claude opens the editor beside its answer and edits as you
                                {editorName === undefined ? '' : `, ${editorName},`} with your access.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <Tabs.Root defaultValue="code" className="k-chat__hosts">
                        <Tabs.List className="k-tab-bar k-tab-bar--underline" aria-label="Where you chat">
                            <Tabs.Tab value="code" className="k-tab k-tab--underline">
                                Claude Code
                            </Tabs.Tab>
                            <Tabs.Tab value="apps" className="k-tab k-tab--underline">
                                Claude desktop and claude.ai
                            </Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="code" className="k-chat__steps">
                            <section className="k-chat__step">
                                <div className="k-chat__step-head">
                                    <h3 className="k-chat__step-title">1. Run this in your terminal</h3>
                                    {chat.token === null ? null : (
                                        <button
                                            type="button"
                                            className="k-text-button"
                                            aria-pressed={revealed}
                                            onClick={() => setRevealed(!revealed)}>
                                            {revealed ? <EyeOff {...ICON} /> : <Eye {...ICON} />}
                                            {revealed ? 'Hide token' : 'Show token'}
                                        </button>
                                    )}
                                </div>
                                <div className="k-chat__code">
                                    <code>{mcpAddCommandOf(chat, origin, shownToken)}</code>
                                    <CopyButton text={mcpAddCommandOf(chat, origin, token)} />
                                </div>
                                <p className="k-help">
                                    {chat.token === null
                                        ? 'Put a token your sign-in accepts in place of <token>. Anyone with it edits as you.'
                                        : 'The token is your session. It signs Claude in as you, so keep it to yourself.'}
                                </p>
                            </section>
                            <section className="k-chat__step">
                                <h3 className="k-chat__step-title">2. Ask Claude</h3>
                                <p className="k-chat__example">Change the front page heading, and save it as a draft.</p>
                            </section>
                        </Tabs.Panel>
                        <Tabs.Panel value="apps" className="k-chat__steps">
                            <section className="k-chat__step">
                                <h3 className="k-chat__step-title">1. Add a custom connector with this address</h3>
                                <div className="k-chat__code">
                                    <code>{address}</code>
                                    <CopyButton text={address} />
                                </div>
                                <p className="k-help">In Claude, open Settings, then Connectors, then Add custom connector.</p>
                            </section>
                            <section className="k-chat__step">
                                <h3 className="k-chat__step-title">
                                    {chat.oauth ? '2. Sign in when Claude asks' : '2. Turn on OAuth first'}
                                </h3>
                                <p className="k-help">
                                    {chat.oauth
                                        ? 'Claude sends you here once to sign in, then edits with your access. There is no token to copy.'
                                        : 'This site’s MCP route signs chats in with a token, which a connector cannot send. Use Claude Code, or ask your developer to turn on OAuth for the route.'}
                                </p>
                            </section>
                        </Tabs.Panel>
                    </Tabs.Root>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
