/**
 * Where a route keeps its handler. The same registry-global symbol core uses,
 * so a search route's handler can run in process for the brand picker.
 */
export const HANDLER: unique symbol = Symbol.for('kizuna.handler') as symbol as typeof HANDLER;
