import clsx from 'clsx';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ClaudeWindow } from '@/components/code/claude-window';
import ChatGPTLogo from '@/icons/ChatGPT.svg';
import ClaudeLogo from '@/icons/Claude.svg';
import CopilotLogo from '@/icons/Copilot.svg';
import McpLogo from '@/icons/Mcp.svg';
import { Section } from './section';
import panel from './panel.module.css';
import styles from './agents.module.css';
import { DocsLink } from '@/components/landing-page/docs-link';

interface Tool {
    method: 'GET' | 'POST' | 'DELETE';
    name: string;
}

const tools: Tool[] = [
    {
        method: 'GET',
        name: 'users_list_users',
    },
    {
        method: 'GET',
        name: 'users_get_user',
    },
    {
        method: 'POST',
        name: 'users_create_user',
    },
    {
        method: 'DELETE',
        name: 'users_delete_user',
    },
];

const methodStyles = {
    GET: styles.methodGet,
    POST: styles.methodPost,
    DELETE: styles.methodDelete,
};

export function Agents() {
    return (
        <Section
            aside={<DocsLink href="/docs/mcp" />}
            title="Your API, ready for AI agents"
            description="Mark a route as a tool and any AI assistant can call it, behind the same types and guards as the rest of your API.">
            <div className={styles.panels}>
                <article className={panel.panel}>
                    <div className={styles.visual}>
                        <div className={styles.diagram}>
                            <div className={styles.agents}>
                                <span className={styles.agent}>
                                    <ClaudeLogo className={styles.agentIcon} aria-hidden />
                                    Claude
                                </span>
                                <span className={styles.agent}>
                                    <ChatGPTLogo className={styles.agentIcon} aria-hidden />
                                    ChatGPT
                                </span>
                                <span className={styles.agent}>
                                    <CopilotLogo className={styles.agentIcon} aria-hidden />
                                    Copilot
                                </span>
                            </div>
                            <span className={styles.wire} aria-hidden />
                            <div className={styles.server}>
                                <McpLogo className={styles.serverIcon} aria-hidden />
                                <span className={styles.serverName}>Your API</span>
                                <span className={styles.serverRole}>MCP endpoint</span>
                            </div>
                            <span className={styles.wire} aria-hidden />
                            <div className={styles.tools}>
                                <p className={styles.toolGroup}>users</p>
                                {tools.map((tool) => (
                                    <p key={tool.name} className={styles.tool}>
                                        <span className={clsx(styles.method, methodStyles[tool.method])}>{tool.method}</span>
                                        {tool.name}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/mcp" className={panel.title}>
                            MCP endpoint
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>
                            Install the MCP plugin, and every route that declares a tool is one AI assistants can discover and call.
                        </p>
                    </div>
                </article>

                <article className={panel.panel}>
                    <div className={styles.visual}>
                        <div className={styles.claudeFrame}>
                            <ClaudeWindow />
                        </div>
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/tools" className={panel.title}>
                            Annotated tools
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>
                            Each tool carries the annotations of its HTTP method, so an assistant reads freely and asks before it deletes.
                        </p>
                    </div>
                </article>
            </div>
        </Section>
    );
}
