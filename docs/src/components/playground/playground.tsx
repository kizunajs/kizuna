'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import clsx from 'clsx';
import { Play, RotateCcw } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import { Button } from '@/components/ui/button';
import panel from '@/components/landing-page/panel.module.css';
import KotlinLogo from '@/icons/Kotlin.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TypeScriptLogo from '@/icons/TypeScript.svg';
import { deprecationTransformer } from './deprecation';
import { toHttp } from './http';
import { createSandbox, type Exchange } from './sandbox';
import { routesOf, scenarios, type Scenario } from './scenarios';
import styles from './playground.module.css';

type Language = 'typescript' | 'swift' | 'kotlin';

const languages: {
    name: Language;
    label: string;
    file: string;
    icon: ComponentType<{
        className?: string;
    }>;
}[] = [
    {
        name: 'typescript',
        label: 'TypeScript',
        file: 'api-client.ts',
        icon: TypeScriptLogo,
    },
    {
        name: 'swift',
        label: 'Swift',
        file: 'UserService.swift',
        icon: SwiftLogo,
    },
    {
        name: 'kotlin',
        label: 'Kotlin',
        file: 'UserService.kt',
        icon: KotlinLogo,
    },
];

export function Playground() {
    const [scenario, setScenario] = useState(scenarios[0]);
    const [language, setLanguage] = useState<Language>('typescript');
    const [ran, setRan] = useState(false);
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const [error, setError] = useState<string | null>(null);
    const runId = useRef(0);
    const response = useRef<HTMLDivElement>(null);

    const sandbox = useMemo(() => createSandbox(scenario.source), [scenario.source]);
    const [callIndex, setCallIndex] = useState(0);
    const call = scenario.calls[callIndex] ?? scenario.calls[0];

    const reset = () => {
        runId.current++;
        setRan(false);
        setExchanges([]);
        setError(null);
    };

    const chooseScenario = (chosen: Scenario) => {
        reset();
        setScenario(chosen);
        setCallIndex(0);
    };

    const chooseCall = (index: number) => {
        reset();
        setCallIndex(index);
    };

    const send = () => {
        const id = ++runId.current;
        setRan(true);
        setExchanges([]);
        setError(null);
        sandbox
            .run(
                call.typescript,
                (exchange) => {
                    if (runId.current !== id) return;
                    setExchanges((current) => {
                        const others = current.filter((candidate) => candidate.id !== exchange.id);
                        return [...others, exchange].sort((first, second) => first.id - second.id);
                    });
                },
                call.scope
            )
            .catch((thrown: unknown) => {
                if (runId.current === id) setError(thrown instanceof Error ? thrown.message : String(thrown));
            });
    };

    const target = useRef<number | 'end'>(0);

    useLayoutEffect(() => {
        const latest = exchanges.at(-1);
        const earlier = toHttp(exchanges.slice(0, -1));
        target.current = latest?.streaming ? 'end' : earlier ? earlier.split('\n').length + 1 : 0;
    }, [exchanges]);

    useEffect(() => {
        const element = response.current;
        if (!element) return;
        const follow = () => {
            const scroller = element.querySelector<HTMLElement>('.fd-scroll-container');
            if (!scroller) return;
            if (target.current === 'end') {
                scroller.scrollTop = scroller.scrollHeight;
                return;
            }
            const line = scroller.querySelectorAll<HTMLElement>('.line')[target.current];
            scroller.scrollTop = line ? line.offsetTop - scroller.offsetTop - 14 : 0;
        };
        const observer = new MutationObserver(follow);
        observer.observe(element, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        return () => observer.disconnect();
    }, []);

    const current = languages.find((candidate) => candidate.name === language) ?? languages[0];
    const FileIcon = current.icon;

    return (
        <div className={styles.playground}>
            <div className={styles.tabsFrame}>
                <div className={styles.tabs} role="tablist" aria-label="Scenarios">
                    {scenarios.map((candidate) => (
                        <button
                            key={candidate.id}
                            type="button"
                            role="tab"
                            aria-selected={candidate.id === scenario.id}
                            onClick={() => chooseScenario(candidate)}
                            className={clsx(styles.tab, candidate.id === scenario.id && styles.tabActive)}>
                            {candidate.title}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.stage}>
                <article className={panel.panel}>
                    <div className={styles.slot}>
                        <CodeWindow lang="ts" code={routesOf(scenario.source)} title="routes.ts" dots scroll />
                    </div>
                    <div className={panel.body}>
                        <p className={panel.title}>{scenario.title}</p>
                        <p className={panel.text}>{scenario.summary}</p>
                    </div>
                </article>

                <article className={panel.panel}>
                    <div className={styles.tabsFrame}>
                        <div className={styles.tabs} role="tablist" aria-label="Clients">
                            {languages.map((candidate) => (
                                <button
                                    key={candidate.name}
                                    type="button"
                                    role="tab"
                                    aria-selected={candidate.name === language}
                                    aria-label={candidate.label}
                                    onClick={() => setLanguage(candidate.name)}
                                    className={clsx(styles.tab, candidate.name === language && styles.tabActive)}>
                                    <candidate.icon aria-hidden />
                                    <span>{candidate.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={clsx(styles.slot, styles.call)}>
                        <CodeWindow
                            lang={language === 'typescript' ? 'ts' : language}
                            code={call[language]}
                            title={current.file}
                            icon={<FileIcon className={styles.fileIcon} />}
                            action={
                                scenario.calls.length > 1 ? (
                                    <div className={clsx(styles.tabs, styles.tabsCompact)} role="tablist" aria-label="Calls">
                                        {scenario.calls.map((candidate, index) => (
                                            <button
                                                key={candidate.label}
                                                type="button"
                                                role="tab"
                                                aria-selected={candidate === call}
                                                onClick={() => chooseCall(index)}
                                                className={clsx(styles.tab, candidate === call && styles.tabActive)}>
                                                {candidate.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : null
                            }
                            dots
                            scroll
                            options={
                                call.deprecated
                                    ? {
                                          themes: {
                                              light: 'github-light',
                                              dark: 'github-dark',
                                          },
                                          transformers: [deprecationTransformer(call.deprecated.symbol, call.deprecated.message, language)],
                                      }
                                    : undefined
                            }
                        />
                    </div>
                    <div ref={response} className={clsx(styles.slot, styles.response)}>
                        <CodeWindow
                            lang="http"
                            code={error ?? (toHttp(exchanges) || ' ')}
                            title="localhost:3000"
                            action={
                                <div className={styles.requestActions}>
                                    <button type="button" onClick={reset} disabled={!ran} aria-label="Reset" className={styles.reset}>
                                        <RotateCcw aria-hidden />
                                    </button>
                                    <Button size="small" onClick={send} className={styles.requestButton}>
                                        <Play aria-hidden />
                                        Send
                                    </Button>
                                </div>
                            }
                            dots
                            scroll
                        />
                        {ran ? null : (
                            <div className={styles.empty}>
                                <span className={styles.emptyIcon}>
                                    <Play aria-hidden />
                                </span>
                                Press Send to see the request and response.
                            </div>
                        )}
                    </div>
                </article>
            </div>
        </div>
    );
}
