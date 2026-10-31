/**
 * Fractional keys: strings that sort in the order items are given, with room
 * between any two for another. An orderable collection keeps each item's
 * place as one, and a frontend can make one for an item it moves before the
 * server answers.
 *
 * ```ts
 * import { keyBetween } from '@kizunajs/cms/keys';
 *
 * const place = keyBetween(above?.place, below?.place);
 * ```
 */

/**
 * The digits a key is written in, in the order they sort. Digits and
 * lowercase letters alone sort the same under any database collation.
 */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * How long a key's whole part is, from its first character: `a` starts two
 * characters, `b` three, up to `z`, and `9` down to `0` start ever longer
 * ones that sort before every `a`.
 */
const wholeLengthOf = (head: string): number | undefined => {
    if (head >= '0' && head <= '9') return 11 - (head.charCodeAt(0) - 48);
    if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 95;
    return undefined;
};

/**
 * The smallest whole part there is, which no key may be alone, so there is
 * always room before one.
 */
const SMALLEST = '0'.repeat(11);

/**
 * Whether a key is one this module writes: digits and lowercase letters, a
 * whole part as long as its first character says, and a fraction that never
 * ends in `0`.
 */
export const isKey = (key: string): boolean => {
    if (!/^[0-9a-z]+$/.test(key) || key === SMALLEST) return false;
    const length = wholeLengthOf(key[0]!);
    return length !== undefined && key.length >= length && (key.length === length || !key.endsWith('0'));
};

const wholeOf = (key: string): string => key.slice(0, wholeLengthOf(key[0]!));

/**
 * A fraction between two others, `after` left out for the end. Neither ends
 * in `0`, and neither does the answer.
 */
const fractionBetween = (before: string, after: string | undefined): string => {
    if (after !== undefined) {
        let shared = 0;
        while ((before[shared] ?? '0') === after[shared]) shared++;
        if (shared > 0) return after.slice(0, shared) + fractionBetween(before.slice(shared), after.slice(shared));
    }
    const low = before === '' ? 0 : DIGITS.indexOf(before[0]!);
    const high = after === undefined ? DIGITS.length : DIGITS.indexOf(after[0]!);
    if (high - low > 1) return DIGITS[Math.round((low + high) / 2)]!;
    if (after !== undefined && after.length > 1) return after[0]!;
    return DIGITS[low] + fractionBetween(before.slice(1), undefined);
};

/**
 * The next whole part, or `undefined` past the largest.
 */
const wholeAfter = (whole: string): string | undefined => {
    const head = whole[0]!;
    const digits = [...whole.slice(1)];
    for (let at = digits.length - 1; at >= 0; at--) {
        const next = DIGITS.indexOf(digits[at]!) + 1;
        if (next < DIGITS.length) {
            digits[at] = DIGITS[next]!;
            return head + digits.join('');
        }
        digits[at] = '0';
    }
    if (head === 'z') return undefined;
    const nextHead = head === '9' ? 'a' : String.fromCharCode(head.charCodeAt(0) + 1);
    // Every digit carried over, so the next head starts at zero, one digit longer or shorter as its head says.
    return nextHead + '0'.repeat(wholeLengthOf(nextHead)! - 1);
};

/**
 * The whole part before, or `undefined` before the smallest.
 */
const wholeBefore = (whole: string): string | undefined => {
    const head = whole[0]!;
    const digits = [...whole.slice(1)];
    for (let at = digits.length - 1; at >= 0; at--) {
        const previous = DIGITS.indexOf(digits[at]!) - 1;
        if (previous >= 0) {
            digits[at] = DIGITS[previous]!;
            return head + digits.join('');
        }
        digits[at] = 'z';
    }
    if (head === '0') return undefined;
    const previousHead = head === 'a' ? '9' : String.fromCharCode(head.charCodeAt(0) - 1);
    return previousHead + 'z'.repeat(wholeLengthOf(previousHead)! - 1);
};

/**
 * A key that sorts after `before` and ahead of `after`, either left out for
 * the start or the end. Keys at either end stay short, so items added last
 * one after another keep short keys.
 *
 * ```ts
 * keyBetween(undefined, undefined); // 'a0'
 * keyBetween('a0', undefined); // 'a1'
 * keyBetween('a0', 'a1'); // 'a0i'
 * ```
 */
export const keyBetween = (before: string | undefined, after: string | undefined): string => {
    for (const key of [before, after]) {
        if (key !== undefined && !isKey(key)) throw new Error(`'${key}' is not a key.`);
    }
    if (before !== undefined && after !== undefined && before >= after) throw new Error(`'${before}' does not sort ahead of '${after}'.`);
    if (before === undefined) {
        if (after === undefined) return 'a0';
        const whole = wholeOf(after);
        if (whole === SMALLEST) return whole + fractionBetween('', after.slice(whole.length));
        if (whole < after) return whole;
        const previous = wholeBefore(whole);
        if (previous === undefined) throw new Error('There is no key before the smallest.');
        return previous;
    }
    const whole = wholeOf(before);
    const fraction = before.slice(whole.length);
    if (after === undefined) return wholeAfter(whole) ?? whole + fractionBetween(fraction, undefined);
    const afterWhole = wholeOf(after);
    if (whole === afterWhole) return whole + fractionBetween(fraction, after.slice(afterWhole.length));
    const next = wholeAfter(whole);
    if (next !== undefined && next < after) return next;
    return whole + fractionBetween(fraction, undefined);
};

/**
 * `count` keys in order between `before` and `after`, either left out for
 * the start or the end.
 */
export const keysBetween = (before: string | undefined, after: string | undefined, count: number): string[] => {
    if (count <= 0) return [];
    if (count === 1) return [keyBetween(before, after)];
    if (after === undefined) {
        const keys = [keyBetween(before, undefined)];
        while (keys.length < count) keys.push(keyBetween(keys[keys.length - 1], undefined));
        return keys;
    }
    if (before === undefined) {
        const keys = [keyBetween(undefined, after)];
        while (keys.length < count) keys.unshift(keyBetween(undefined, keys[0]));
        return keys;
    }
    const middle = Math.floor(count / 2);
    const key = keyBetween(before, after);
    return [...keysBetween(before, key, middle), key, ...keysBetween(key, after, count - middle - 1)];
};

/**
 * Sorts two keys the way the store does, for `Array.prototype.sort`.
 */
export const compareKeys = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
