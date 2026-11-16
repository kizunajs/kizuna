/**
 * `pgmq.create` on an existing queue waits for every open transaction using it.
 *
 * @see https://github.com/pgmq/pgmq/issues/601
 */
export const createQueue = `select pgmq.create($1::text)
where not exists (select 1 from pgmq.meta where queue_name = $1::text)`;

/**
 * `$1` queue, `$2` message, `$3` run at. The delay is worked out on the
 * database's clock, and `null` sends at once.
 */
export const send = `select pgmq.send($1::text, $2::jsonb, greatest(0, ceil(extract(epoch from ($3::timestamptz - now()))))::int) as msg_id`;

/**
 * `$1` queues, `$2` visibility timeout in seconds, `$3` messages per queue.
 */
export const read = `select queue.name as queue_name, message.msg_id, message.read_ct, message.message
from unnest($1::text[]) as queue(name)
cross join lateral pgmq.read(queue.name, $2::int, $3::int) as message`;

export const remove = `select pgmq.delete($1::text, $2::bigint)`;

export const archive = `select pgmq.archive($1::text, $2::bigint)`;

/**
 * `$3` seconds until the message is visible again.
 */
export const retryLater = `select pgmq.set_vt($1::text, $2::bigint, $3::int)`;
