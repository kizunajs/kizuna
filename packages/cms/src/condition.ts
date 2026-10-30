/**
 * A value a condition compares a field with.
 */
export type ConditionValue = string | number | boolean;

/**
 * When a field shows, from the value of another field beside it: `is` shows
 * it while that field holds the value, or one of the values, and `isNot`
 * while it holds none of them. On a field holding a list, holding means the
 * list contains it.
 *
 * @example
 * condition: {
 *     field: 'category',
 *     is: 'guide',
 * },
 */
export type FieldCondition =
    | {
          /**
           * The field beside this one whose value decides, in the same page,
           * block or item.
           */
          field: string;
          is: ConditionValue | readonly ConditionValue[];
      }
    | {
          /**
           * The field beside this one whose value decides, in the same page,
           * block or item.
           */
          field: string;
          isNot: ConditionValue | readonly ConditionValue[];
      };

/**
 * A condition as it travels to the editor.
 */
export interface WireCondition {
    field: string;
    is?: ConditionValue | ConditionValue[];
    isNot?: ConditionValue | ConditionValue[];
}

/**
 * A condition as either side reads it.
 */
type ReadCondition = {
    field: string;
    is?: unknown;
    isNot?: unknown;
};

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const copied = (value: ConditionValue | readonly ConditionValue[]): ConditionValue | ConditionValue[] =>
    typeof value === 'object' ? [...value] : value;

/**
 * Whether a field shows, given the value of the field its condition names.
 */
export const conditionHolds = (condition: ReadCondition, value: unknown): boolean => {
    const matches = (expected: unknown): boolean =>
        listOf(expected).some((candidate) => (Array.isArray(value) ? value.includes(candidate) : value === candidate));
    return 'isNot' in condition ? !matches(condition.isNot) : matches(condition.is);
};

const shown = (value: unknown): string => (typeof value === 'string' ? `'${value}'` : String(value));

/**
 * The condition in words, for the agent.
 */
export const conditionText = (condition: ReadCondition): string => {
    const negated = 'isNot' in condition;
    const values = listOf(negated ? condition.isNot : condition.is).map(shown);
    const verb = values.length > 1 ? (negated ? 'is none of' : 'is one of') : negated ? 'is not' : 'is';
    return `Shown only while '${condition.field}' ${verb} ${values.join(', ')}. While hidden, publishing does not need it, and a value it holds is kept.`;
};

/**
 * The condition as plain data, for the wire.
 */
export const conditionForWire = (condition: FieldCondition): WireCondition =>
    'isNot' in condition
        ? {
              field: condition.field,
              isNot: copied(condition.isNot),
          }
        : {
              field: condition.field,
              is: copied(condition.is),
          };
