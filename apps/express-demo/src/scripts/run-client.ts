import { readToolCalls, type ToolAnswer } from 'kizunajs';
import { apiClient } from '../lib/api-client';
import { isValidationError } from '../lib/api-client.generated';

const collect = async <Message>(stream: AsyncIterable<Message>): Promise<Message[]> => {
    const messages: Message[] = [];
    for await (const message of stream) messages.push(message);
    return messages;
};

/**
 * One turn of `assistant.chat`, with every message it streamed.
 */
const chat = async (prompt: string, headers: Record<string, string>, answer?: ToolAnswer) => {
    const result = await apiClient.assistant.chat({
        body: {
            prompt,
            ...(answer === undefined
                ? {}
                : {
                      answer,
                  }),
        },
        headers,
    });
    return result.status === 200 ? collect(result.body) : [];
};

/**
 * Each tool call as one row, then what the assistant said.
 */
const show = (messages: Awaited<ReturnType<typeof chat>>): void => {
    for (const call of readToolCalls(messages)) console.log(`  ${call.name}: ${call.state}`);
    for (const message of messages) {
        if (message.event === 'delta') console.log(`  ${message.data.text}`);
    }
};

const main = async () => {
    console.log('--- listUsers ---');
    const list = await apiClient.users.listUsers({
        query: {
            page: 1,
            limit: 10,
        },
    });
    if (list.status === 200) {
        console.log(`users: ${list.body.users.length}, total: ${list.body.total}`);
    }

    console.log('--- searchUsers (hover limit/cursor to see required coerced numbers) ---');
    const found = await apiClient.users.searchUsers({
        query: {
            q: 'ada',
            limit: 20,
            cursor: 0,
        },
    });
    if (found.status === 200) {
        console.log(`matches: ${found.body.users.length}, nextCursor: ${found.body.nextCursor}`);
    }

    console.log('--- createUser ---');
    const created = await apiClient.users.createUser({
        body: {
            name: 'Grace Hopper',
            email: 'grace@example.com',
        },
    });
    if (created.status === 201) {
        console.log('created:', created.body.id, created.body.name);

        console.log('--- getUser created.id ---');
        const got = await apiClient.users.getUser({
            params: {
                id: created.body.id,
            },
            headers: {
                'x-request-id': 'demo-1',
            },
        });
        if (got.status === 200) console.log('found:', got.body.name);

        console.log('--- userActivity (hover year to see a number, not a string) ---');
        const activity = await apiClient.users.userActivity({
            params: {
                id: created.body.id,
                year: 2024,
            },
        });
        if (activity.status === 200) console.log(`events in ${activity.body.year}:`, activity.body.events);

        console.log('--- deleteUser created.id ---');
        const deleted = await apiClient.users.deleteUser({
            params: {
                id: created.body.id,
            },
        });
        if (deleted.status === 200) console.log('deleted, success:', deleted.body.success);

        console.log('--- getUser created.id again (expect 404) ---');
        const miss = await apiClient.users.getUser({
            params: {
                id: created.body.id,
            },
            headers: {
                'x-request-id': 'demo-2',
            },
        });
        if (miss.status === 404) console.log('expected 404:', miss.body.detail);
    } else {
        console.log('create failed:', created.body.detail);
    }

    console.log('--- createUser invalid email (expect 400) ---');
    const bad = await apiClient.users.createUser({
        body: {
            name: 'X',
            email: 'not-an-email',
        },
    });
    console.log('status:', bad.status);

    console.log('--- createUser invalid phone (expect 400 with custom code) ---');
    const badPhone = await apiClient.users.createUser({
        body: {
            name: 'Grace Hopper',
            email: 'grace@example.com',
            phone: 'not-a-phone',
        },
    });
    if (badPhone.status === 400 && isValidationError(badPhone.body)) {
        for (const issue of badPhone.body.errors) {
            // `issue.code` is typed as ValidationIssueCode, comparing against
            // the custom `invalid_phone_number` is fully type-checked.
            if (issue.code === 'invalid_phone_number') {
                console.log('custom code:', issue.code, '->', issue.message);
            }
        }
    }
    console.log('--- assistant.reply (streams server-sent events) ---');
    const reply = await apiClient.assistant.reply({
        body: {
            prompt: 'What does streaming look like?',
        },
    });
    if (reply.status === 200) {
        for await (const message of reply.body) {
            if (message.event === 'delta') process.stdout.write(message.data.text);
            if (message.event === 'done') console.log(`\n(${message.data.outputTokens} tokens)`);
        }
    }

    console.log('--- assistant.chat (runs the notes routes as tools, as whoever is signed in) ---');
    const asAda = {
        authorization: 'Bearer tok_ada',
    };
    const remember = 'remember the demo is on Friday';

    const asked = await chat(remember, asAda);
    show(asked);
    const [waiting] = readToolCalls(asked);
    if (waiting?.state === 'needs-approval' && waiting.name === 'notes.add') {
        console.log(`the assistant wants to save "${waiting.input.body.text}", approving`);
        show(
            await chat(remember, asAda, {
                call: waiting,
                approved: true,
            })
        );
    }

    console.log('--- assistant.chat as Ada, then as Linus: each reads their own notes ---');
    show(await chat('what do you remember?', asAda));
    show(
        await chat('what do you remember?', {
            authorization: 'Bearer tok_linus',
        })
    );
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
