'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { useRender } from '@base-ui/react/use-render';
import styles from './button.module.css';

interface ButtonStyleProps {
    variant?: 'primary' | 'secondary';
    size?: 'small' | 'medium';
    className?: string;
}

function buttonClassName({ variant = 'primary', size = 'medium', className }: ButtonStyleProps) {
    return clsx(styles.button, styles[variant], styles[size], className);
}

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & ButtonStyleProps;

export function Button({ variant, size, className, ...props }: ButtonProps) {
    return (
        <BaseButton
            className={buttonClassName({
                variant,
                size,
                className,
            })}
            {...props}
        />
    );
}

type ButtonLinkProps = Omit<ComponentProps<'a'>, 'className'> &
    ButtonStyleProps & {
        href: string;
    };

/**
 * A link styled as a `Button`. Internal paths render a Next.js `Link`, and
 * absolute URLs render an `<a>` that opens in a new tab.
 */
export function ButtonLink({ href, variant, size, className, ...props }: ButtonLinkProps) {
    const isExternal = /^https?:\/\//.test(href);

    return useRender({
        render: isExternal ? <a href={href} target="_blank" rel="noreferrer" /> : <Link href={href} />,
        props: {
            ...props,
            className: buttonClassName({
                variant,
                size,
                className,
            }),
        },
    });
}
