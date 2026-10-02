import type { Field, FieldList } from './field.js';
import { fieldChain } from './content.js';

/**
 * Who is writing: the role the guard returned, and the permissions it holds.
 */
export interface Caller {
    role?: string | readonly string[];
    permissions?: readonly string[];
}

const rolesOf = (caller: Caller): readonly string[] =>
    caller.role === undefined ? [] : typeof caller.role === 'string' ? [caller.role] : caller.role;

const toList = (roles: string | readonly string[] | undefined): readonly string[] =>
    roles === undefined ? [] : typeof roles === 'string' ? [roles] : roles;

/**
 * Why one field refuses a caller, or `undefined` when the caller may write it.
 */
export const writeRefusal = (field: Field, caller: Caller): string | undefined => {
    if (field.readOnly === true) return `The field '${field.name}' is read only.`;
    const accepted = toList(field.auth?.roles);
    if (accepted.length > 0 && !rolesOf(caller).some((role) => accepted.includes(role))) {
        return `The field '${field.name}' takes the role ${accepted.map((role) => `'${role}'`).join(' or ')}.`;
    }
    const requires = field.auth?.requires ?? {};
    const held = caller.permissions ?? [];
    for (const [resource, verbs] of Object.entries(requires)) {
        for (const verb of verbs) {
            if (!held.includes(`${resource}:${verb}`)) return `The field '${field.name}' requires '${resource}:${verb}'.`;
        }
    }
    return undefined;
};

/**
 * Whether a caller may write every field a dotted path crosses.
 */
export const mayWrite = (fields: FieldList, path: string, caller: Caller): boolean => {
    const chain = fieldChain(fields, path);
    if (chain === undefined) return false;
    return chain.every((field) => writeRefusal(field, caller) === undefined);
};

/**
 * The first refusal along a dotted path, or `undefined` when the caller may
 * write it. An unknown path is not a refusal; validation reports it.
 */
export const pathRefusal = (fields: FieldList, path: string, caller: Caller): string | undefined => {
    const chain = fieldChain(fields, path);
    if (chain === undefined) return undefined;
    for (const field of chain) {
        const refusal = writeRefusal(field, caller);
        if (refusal !== undefined) return refusal;
    }
    return undefined;
};
