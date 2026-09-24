'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { MeshGradient, Water } from '@paper-design/shaders-react';
import styles from './hero-backdrop.module.css';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

const palette = {
    canvas: '#0c0c0c',
    soft: '#1a1a1a',
    mid: '#333333',
};

const logoMark = '/logo-mark.svg';

function useImageReady(source: string | undefined) {
    const [ready, setReady] = useState(source === undefined);

    useEffect(() => {
        if (source === undefined) return;
        const image = new Image();
        image.src = source;
        image
            .decode()
            .catch(() => undefined)
            .then(() => setReady(true));
    }, [source]);

    return ready;
}

export function HeroBackdrop({ variant = 'mesh', className }: { variant?: 'mesh' | 'water'; className?: string }) {
    const reducedMotion = usePrefersReducedMotion();
    const [mounted, setMounted] = useState(false);
    const imageReady = useImageReady(variant === 'water' ? logoMark : undefined);

    useEffect(() => setMounted(true), []);

    if (!mounted || !imageReady) return <div className={clsx(styles.root, className)} aria-hidden />;

    const speed = reducedMotion ? 0 : 1;

    return (
        <div className={clsx(styles.root, styles.shown, className)} aria-hidden>
            {variant === 'water' ? (
                <Water
                    width="100%"
                    height="100%"
                    image={logoMark}
                    fit="contain"
                    colorBack={palette.canvas}
                    colorHighlight={palette.mid}
                    highlights={0.07}
                    layering={0.5}
                    edges={0.8}
                    waves={0.3}
                    caustic={0.1}
                    scale={0.36}
                    offsetY={0.14}
                    speed={0.5 * speed}
                />
            ) : (
                <MeshGradient
                    width="100%"
                    height="100%"
                    colors={[palette.canvas, palette.soft, palette.mid, palette.canvas]}
                    distortion={0.9}
                    swirl={0.45}
                    grainOverlay={0.08}
                    speed={0.45 * speed}
                />
            )}
            {variant === 'mesh' ? <span className={styles.scrim} /> : null}
        </div>
    );
}
