import { useEffect, useState } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { humanize } from '../view/schema.js';
import type { ListFilter } from './config.js';
import { NO_FILTERS, STATUS_CHOICES, STATUS_FIELD, withCondition, type Condition, type Filters, type Operator } from './list-filters.js';

interface Choice {
    value: string;
    label: string;
}

const OPERATORS: Record<Operator, string> = {
    is: 'is',
    isNot: 'is not',
    within: 'is within',
    outside: 'is outside',
};

/**
 * A filled select with its label above, or read only by a screen reader on
 * the rows after the first.
 */
function Picker({
    label,
    labelShown,
    choices,
    value,
    placeholder,
    onChange,
}: {
    label: string;
    labelShown: boolean;
    choices: readonly Choice[];
    value: string | undefined;
    placeholder?: string;
    onChange: (value: string) => void;
}) {
    return (
        <Select.Root items={choices} value={value ?? null} onValueChange={(next) => (next === null ? undefined : onChange(next))}>
            <div className="k-filter-panel__field">
                <Select.Label className={labelShown ? 'k-filter-panel__label' : 'k-visually-hidden'}>{label}</Select.Label>
                <Select.Trigger className="k-filter-panel__select">
                    <Select.Value className="k-ellipsis" placeholder={placeholder} />
                    <ChevronDown {...ICON} />
                </Select.Trigger>
            </div>
            <Select.Portal>
                <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu">
                        {choices.map((choice) => (
                            <Select.Item key={choice.value} value={choice.value} className="k-menu__item">
                                <Select.ItemText>{choice.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu__check">
                                    <Check {...ICON} />
                                </Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}

interface SearchResult {
    id: string;
    label: string;
    treeLabel?: string;
}

/**
 * The ids a field may hold, by their path in the tree when they have one.
 */
const useBrandChoices = (connection: Connection, brand: string | undefined): Choice[] => {
    const [choices, setChoices] = useState<Choice[]>([]);
    useEffect(() => {
        if (brand === undefined) return;
        void connection
            .call<{ items: SearchResult[] }>('editing_search_items', {
                params: {
                    brand,
                },
            })
            .then((answer) => {
                if (answer.status !== 200) return;
                setChoices(
                    answer.body.items
                        .map((item) => ({
                            value: item.id,
                            label: item.treeLabel ?? item.label,
                        }))
                        .sort((left, right) => left.label.localeCompare(right.label))
                );
            });
    }, [connection, brand]);
    return choices;
};

const labelOf = (filter: ListFilter): string => filter.label ?? humanize(filter.field);

/**
 * The words a condition's value is read in, like "Status is Published", for
 * the button that removes it.
 */
const conditionText = (field: string, operator: Operator, value: string | undefined): string =>
    `${field} ${OPERATORS[operator]}${value === undefined ? '' : ` ${value}`}`;

function ConditionRow({
    connection,
    filters,
    byStatus,
    condition,
    first,
    onChange,
    onRemove,
}: {
    connection: Connection;
    filters: readonly ListFilter[];
    byStatus: boolean;
    condition: Condition;
    first: boolean;
    onChange: (condition: Condition) => void;
    onRemove: (() => void) | undefined;
}) {
    const filter = filters.find((candidate) => candidate.field === condition.field);
    const fetched = useBrandChoices(connection, filter?.choices === undefined ? filter?.brand : undefined);
    const values = condition.field === STATUS_FIELD ? STATUS_CHOICES : (filter?.choices ?? fetched);
    const operators: Operator[] = filter?.nested === true ? ['is', 'isNot', 'within', 'outside'] : ['is', 'isNot'];
    const fieldLabel = filter === undefined ? 'Status' : labelOf(filter);
    const valueLabel = values.find((choice) => choice.value === condition.value)?.label;
    return (
        <div className="k-filter-panel__condition">
            <span className="k-filter-panel__join">{first ? 'Where' : condition.join}</span>
            <Picker
                label="Field"
                labelShown={first}
                choices={[
                    ...(byStatus
                        ? [
                              {
                                  value: STATUS_FIELD,
                                  label: 'Status',
                              },
                          ]
                        : []),
                    ...filters.map((candidate) => ({
                        value: candidate.field,
                        label: labelOf(candidate),
                    })),
                ]}
                value={condition.field}
                onChange={(field) =>
                    onChange({
                        join: condition.join,
                        field,
                        operator: 'is',
                        value: undefined,
                    })
                }
            />
            <Picker
                label="Condition"
                labelShown={first}
                choices={operators.map((operator) => ({
                    value: operator,
                    label: OPERATORS[operator],
                }))}
                value={condition.operator}
                onChange={(operator) =>
                    onChange({
                        ...condition,
                        operator: operator as Operator,
                    })
                }
            />
            <Picker
                label="Value"
                labelShown={first}
                choices={values}
                value={condition.value}
                placeholder="Choose"
                onChange={(value) =>
                    onChange({
                        ...condition,
                        value,
                    })
                }
            />
            {onRemove === undefined ? (
                <span />
            ) : (
                <button
                    type="button"
                    className="k-icon-button k-filter-panel__remove"
                    aria-label={`Remove ${conditionText(fieldLabel, condition.operator, valueLabel)}`}
                    onClick={onRemove}>
                    <X {...ICON} />
                </button>
            )}
        </div>
    );
}

const blankCondition = (join: Condition['join'], field: string): Condition => ({
    join,
    field,
    operator: 'is',
    value: undefined,
});

/**
 * The filters above a list: rows of a field, how it compares and a value,
 * each joined to the row above by `and` or `or`. Rows joined by `and` must
 * all hold, and `or` starts another set that may hold instead. Without
 * `byStatus`, as for a view, the rows offer the fields alone.
 */
export function FilterPanel({
    id,
    connection,
    filters,
    byStatus = true,
    value,
    onChange,
}: {
    id: string;
    connection: Connection;
    filters: readonly ListFilter[];
    byStatus?: boolean;
    value: Filters;
    onChange: (filters: Filters) => void;
}) {
    const firstField = byStatus ? STATUS_FIELD : (filters[0]?.field ?? STATUS_FIELD);
    const rows = value.length === 0 ? [blankCondition('and', firstField)] : value;
    return (
        <section id={id} className="k-list-panel k-filter-panel" aria-label="Filters">
            {rows.map((condition, index) => (
                <ConditionRow
                    key={index}
                    connection={connection}
                    filters={filters}
                    byStatus={byStatus}
                    condition={condition}
                    first={index === 0}
                    onChange={(next) => onChange(value.length === 0 ? [next] : withCondition(value, index, next))}
                    onRemove={value.length === 0 ? undefined : () => onChange(withCondition(value, index, undefined))}
                />
            ))}
            <div className="k-filter-panel__foot">
                <button
                    type="button"
                    className="k-button k-button--small k-list-panel__button"
                    onClick={() => onChange([...rows, blankCondition('and', firstField)])}>
                    <Plus {...ICON} />
                    And
                </button>
                <button
                    type="button"
                    className="k-button k-button--small k-list-panel__button"
                    onClick={() => onChange([...rows, blankCondition('or', firstField)])}>
                    <Plus {...ICON} />
                    Or
                </button>
                <span className="k-spacer" />
                {value.length === 0 ? null : (
                    <button
                        type="button"
                        className="k-button k-button--small k-list-panel__button k-list-panel__button--muted"
                        onClick={() => onChange(NO_FILTERS)}>
                        Clear filters
                    </button>
                )}
            </div>
        </section>
    );
}
