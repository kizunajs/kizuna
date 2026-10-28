import { useEffect, useState } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { humanize } from '../view/schema.js';
import type { ListFilter } from './config.js';
import { NO_FILTERS, STATUS_CHOICES, isFiltering, withField, type Filters } from './list-filters.js';

interface Choice {
    value: string;
    label: string;
}

/**
 * The value an item of the menu holds for "any", since a menu item needs one.
 */
const ANY = '';

/**
 * One chip: the field's name, and the value picked from its menu.
 */
function Chip({
    label,
    choices,
    value,
    onChange,
}: {
    label: string;
    choices: readonly Choice[];
    value: string | undefined;
    onChange: (value: string | undefined) => void;
}) {
    const items = [
        {
            value: ANY,
            label: 'Any',
        },
        ...choices,
    ];
    const picked = choices.find((choice) => choice.value === value);
    return (
        <Select.Root
            items={items}
            value={value ?? ANY}
            onValueChange={(next) => onChange(next === null || next === ANY ? undefined : next)}>
            <Select.Trigger className="k-admin-chip" data-active={picked === undefined ? undefined : ''} aria-label={`Filter by ${label}`}>
                <span>{label}</span>
                {picked === undefined ? null : <b className="k-ellipsis">{picked.label}</b>}
                <ChevronDown {...ICON} />
            </Select.Trigger>
            <Select.Portal>
                <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu">
                        {items.map((item) => (
                            <Select.Item key={item.value} value={item.value} className="k-menu-item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu-check">
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

function FieldChip({
    connection,
    filter,
    filters,
    onChange,
}: {
    connection: Connection;
    filter: ListFilter;
    filters: Filters;
    onChange: (filters: Filters) => void;
}) {
    const fetched = useBrandChoices(connection, filter.brand);
    const choices = filter.choices ?? fetched;
    const current = filters.fields[filter.field];
    const label = filter.label ?? humanize(filter.field);
    return (
        <>
            <Chip
                label={label}
                choices={choices}
                value={current?.value}
                onChange={(value) =>
                    onChange(
                        withField(
                            filters,
                            filter.field,
                            value === undefined
                                ? undefined
                                : {
                                      value,
                                      descendants: current?.descendants ?? false,
                                  }
                        )
                    )
                }
            />
            {filter.nested === true && current !== undefined ? (
                <button
                    type="button"
                    className="k-admin-chip"
                    aria-pressed={current.descendants}
                    data-active={current.descendants ? '' : undefined}
                    onClick={() =>
                        onChange(
                            withField(filters, filter.field, {
                                ...current,
                                descendants: !current.descendants,
                            })
                        )
                    }>
                    and below
                </button>
            ) : null}
        </>
    );
}

/**
 * Chips above a list, one for the status and one for each field it filters
 * by. A field holding ids of a tree offers "and below" once one is picked.
 */
export function FilterChips({
    connection,
    filters: fieldFilters,
    value,
    onChange,
}: {
    connection: Connection;
    filters: readonly ListFilter[];
    value: Filters;
    onChange: (filters: Filters) => void;
}) {
    return (
        <div className="k-admin-chips" role="group" aria-label="Filters">
            <Chip
                label="Status"
                choices={STATUS_CHOICES}
                value={value.status}
                onChange={(status) =>
                    onChange({
                        ...value,
                        status,
                    })
                }
            />
            {fieldFilters.map((filter) => (
                <FieldChip key={filter.field} connection={connection} filter={filter} filters={value} onChange={onChange} />
            ))}
            {isFiltering(value) ? (
                <button type="button" className="k-admin-chip k-admin-chip-clear" onClick={() => onChange(NO_FILTERS)}>
                    <X {...ICON} />
                    Clear
                </button>
            ) : null}
        </div>
    );
}
