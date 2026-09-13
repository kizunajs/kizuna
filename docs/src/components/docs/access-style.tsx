'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

type AccessStyleValue = 'identity' | 'roles' | 'permissions';

const STORAGE_KEY = 'kizuna-access-style';

const options: Array<{ value: AccessStyleValue; label: string }> = [
    {
        value: 'identity',
        label: 'Identity only',
    },
    {
        value: 'roles',
        label: 'Roles',
    },
    {
        value: 'permissions',
        label: 'Roles with permissions',
    },
];

let current: AccessStyleValue | undefined;
const listeners = new Set<() => void>();

const read = (): AccessStyleValue => {
    if (current !== undefined) return current;
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        current = stored === 'permissions' || stored === 'identity' ? stored : 'roles';
    } catch {
        current = 'roles';
    }
    return current;
};

const write = (value: AccessStyleValue): void => {
    current = value;
    try {
        window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
        // Private mode: the choice lasts for the page only.
    }
    for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const useAccessStyle = (): AccessStyleValue => useSyncExternalStore(subscribe, read, () => 'roles');

/**
 * One switch for the whole page. Every `AccessStyle` block below follows it.
 */
export function AccessStyleSwitch() {
    const active = useAccessStyle();
    return (
        <div className="not-prose my-6 flex w-fit gap-1 rounded-lg border bg-fd-secondary p-1" role="tablist">
            {options.map((option) => {
                const selected = option.value === active;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => write(option.value)}
                        className={
                            selected
                                ? 'rounded-md bg-fd-background px-3 py-1.5 text-sm font-medium text-fd-foreground shadow-sm'
                                : 'rounded-md px-3 py-1.5 text-sm font-medium text-fd-muted-foreground hover:text-fd-foreground'
                        }>
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

interface AccessStyleProps {
    value: AccessStyleValue;
    children: ReactNode;
}

/**
 * Content shown only while the page's switch is on `value`.
 */
export function AccessStyle({ value, children }: AccessStyleProps) {
    const active = useAccessStyle();
    if (active !== value) return null;
    return <>{children}</>;
}
