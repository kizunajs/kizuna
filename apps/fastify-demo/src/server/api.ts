import { fastifyAdapter } from '@ts-kizuna/fastify';
import { mcpPluginServer } from '@ts-kizuna/mcp/server';
import { openApiPluginServer } from '@ts-kizuna/openapi/server';
import { k, contract } from '@ts-kizuna-demo/shared';
import { requireUser, requireMember, requireInviteToken, requireScheduler } from './guards';
import { captureAnalytics } from './request-context';

export const api = k.api({
    contract,
    adapter: fastifyAdapter,
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
