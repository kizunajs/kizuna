import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Check, ChevronsUpDown, ExternalLink, GripVertical, Plus, Search, X } from 'lucide-react';
import Logo from '@/icons/Logo.svg';
import styles from './cms-editor.module.css';

export function Editor({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={clsx(styles.editor, className)}>{children}</div>;
}

interface ShellProps {
    title: string;
    status: 'Published' | 'Unpublished changes';
    saved?: boolean;
    children: ReactNode;
}

export function Shell({ title, status, saved = false, children }: ShellProps) {
    return (
        <Editor className={styles.shell}>
            <div className={styles.header}>
                <Logo className={styles.logo} aria-hidden />
                <div className={styles.title}>
                    <span className={styles.titleName}>{title}</span>
                    <span className={clsx(styles.status, status === 'Published' && styles.statusPublished)}>{status}</span>
                    {saved ? (
                        <span className={styles.save}>
                            <Check aria-hidden />
                            Saved
                        </span>
                    ) : null}
                </div>
                <span className={styles.link}>
                    example.com/
                    <ExternalLink aria-hidden />
                </span>
            </div>
            {children}
        </Editor>
    );
}

export function FormSection({ children }: { children: ReactNode }) {
    return <div className={styles.section}>{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className={styles.row}>
            <span className={styles.label}>{label}</span>
            <div className={styles.inputs}>{children}</div>
        </div>
    );
}

interface TextInputProps {
    value: string;
    max?: number;
    multiline?: boolean;
    mark?: 'changed' | 'pointed';
    disabled?: boolean;
}

export function TextInput({ value, max, multiline = false, mark, disabled = false }: TextInputProps) {
    return (
        <div
            className={clsx(
                styles.input,
                max !== undefined && styles.withCounter,
                multiline && styles.textarea,
                mark === 'changed' && styles.changed,
                mark === 'pointed' && styles.pointed,
                disabled && styles.disabled
            )}>
            <span className={styles.value}>{value}</span>
            {max === undefined ? null : (
                <span className={styles.counter}>
                    {value.length}/{max}
                </span>
            )}
        </div>
    );
}

export function Select({ value, image }: { value: string; image?: string }) {
    return (
        <div className={styles.input}>
            {image === undefined ? null : <img className={styles.thumb} src={image} alt="" />}
            <span className={styles.value}>{value}</span>
            <ChevronsUpDown className={styles.icon} aria-hidden />
        </div>
    );
}

export function Help({ children }: { children: ReactNode }) {
    return <p className={styles.help}>{children}</p>;
}

interface Choice {
    label: string;
    image?: string;
    icon?: ReactNode;
}

export function SortableList({ items }: { items: Choice[] }) {
    return (
        <div className={styles.list}>
            {items.map((item) => (
                <div key={item.label} className={styles.listItem}>
                    <span className={styles.iconButton}>
                        <GripVertical aria-hidden />
                    </span>
                    <Select value={item.label} image={item.image} />
                    <span className={styles.iconButton}>
                        <X aria-hidden />
                    </span>
                </div>
            ))}
            <div>
                <span className={clsx(styles.button, styles.secondary, styles.small)}>
                    <Plus aria-hidden />
                    Add
                </span>
            </div>
        </div>
    );
}

export function ImageControl({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
    return (
        <div className={styles.image}>
            <div className={styles.imageFrame}>
                <img src={src} alt="" />
                <span
                    className={styles.focal}
                    style={{
                        left: '42%',
                        top: '58%',
                    }}
                />
            </div>
            <div className={styles.imageActions}>
                <span className={clsx(styles.button, styles.secondary, styles.small)}>Replace</span>
                <span className={styles.help}>
                    {width} × {height} · click the image to set its focus
                </span>
            </div>
            <Row label="Alt text">
                <TextInput value={alt} />
            </Row>
        </div>
    );
}

interface PickerProps {
    query: string;
    options: (Choice & {
        chosen?: boolean;
    })[];
    className?: string;
}

export function Picker({ query, options, className }: PickerProps) {
    return (
        <Editor className={clsx(styles.popup, className)}>
            <div className={styles.search}>
                <Search aria-hidden />
                <span className={styles.searchValue}>{query}</span>
                <span className={styles.caret} />
            </div>
            <div className={styles.options}>
                {options.map((option, index) => (
                    <div key={option.label} className={clsx(styles.option, index === 0 && styles.optionActive)}>
                        {option.image === undefined ? null : <img className={styles.thumb} src={option.image} alt="" />}
                        {option.icon === undefined ? null : <span className={styles.thumbIcon}>{option.icon}</span>}
                        <span className={styles.value}>{option.label}</span>
                        {option.chosen ? <Check className={styles.check} aria-hidden /> : null}
                    </div>
                ))}
            </div>
        </Editor>
    );
}

export function Footer({ children }: { children: ReactNode }) {
    return <div className={styles.footer}>{children}</div>;
}

export function Button({ variant, children }: { variant: 'primary' | 'secondary' | 'quiet'; children: ReactNode }) {
    return <span className={clsx(styles.button, styles[variant])}>{children}</span>;
}

/**
 * The front page once the model has shortened its heading.
 */
export function FrontPageEditor() {
    return (
        <Shell title="Front Page" status="Unpublished changes" saved>
            <FormSection>
                <Row label="Heading">
                    <TextInput value="Invoices that send themselves" max={60} mark="changed" />
                    <Help>Under 8 words. No full stop.</Help>
                </Row>
                <Row label="Introduction">
                    <TextInput value="Create, send and chase invoices from one place, and get paid twice as fast." max={400} multiline />
                </Row>
                <Row label="Hero image">
                    <ImageControl src="/cms/team-at-laptops.jpg" alt="The team at work" width={1600} height={1067} />
                </Row>
            </FormSection>
            <Footer>
                <Button variant="secondary">Open preview</Button>
                <Button variant="primary">Publish</Button>
            </Footer>
        </Shell>
    );
}
