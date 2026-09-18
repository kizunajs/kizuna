import { expressAdapter } from '@ts-kizuna/express';
import { mcpPluginServer } from '@ts-kizuna/mcp/server';
import { openApiPluginServer } from '@ts-kizuna/openapi/server';
import { k, contract } from '@ts-kizuna-demo/shared';
import { requireUser, requireMember, requireInviteToken, requireScheduler } from './guards';
import { captureAnalytics } from './request-context';
import { jobHandlers } from './jobs';
import { toolHandlers } from './tools';

export const api = k.api({
    contract,
    adapter: expressAdapter,
    jobs: jobHandlers,
    tools: toolHandlers,
    guards: {
        user: requireUser,
        member: requireMember,
        inviteToken: requireInviteToken,
        scheduler: requireScheduler,
    },
    requestContext: {
        analytics: captureAnalytics,
    },
    plugins: {
        mcp: mcpPluginServer(),
        openApi: openApiPluginServer(),
    },
});
