'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Dithering, MeshGradient, NeuroNoise } from '@paper-design/shaders-react';
import styles from './hero-backdrop.module.css';

type Backdrop = 'mesh' | 'dithering' | 'neuro';

const BACKDROP: Backdrop = 'mesh';

const palette = {
    canvas: '#0b0b0b',
    soft: '#1a1a1a',
    mid: '#333333',
    strong: '#4a4a4a',
};

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    return reduced;
}

export function HeroBackdrop({ className }: { className?: string }) {
    const reducedMotion = usePrefersReducedMotion();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) return <div className={clsx(styles.root, className)} aria-hidden />;

    const speed = reducedMotion ? 0 : 1;

    return (
        <div className={clsx(styles.root, styles.shown, className)} aria-hidden>
            {BACKDROP === 'mesh' ? (
                <MeshGradient
                    width="100%"
                    height="100%"
                    colors={[palette.canvas, palette.soft, palette.mid, palette.canvas]}
                    distortion={0.9}
                    swirl={0.45}
                    grainOverlay={0.08}
                    speed={0.45 * speed}
                />
            ) : null}
            {BACKDROP === 'dithering' ? (
                <Dithering
                    width="100%"
                    height="100%"
                    colorBack={palette.canvas}
                    colorFront={palette.mid}
                    shape="warp"
                    type="4x4"
                    size={2}
                    speed={0.3 * speed}
                />
            ) : null}
            {BACKDROP === 'neuro' ? (
                <NeuroNoise
                    width="100%"
                    height="100%"
                    colorBack={palette.canvas}
                    colorMid={palette.mid}
                    colorFront={palette.strong}
                    brightness={0.05}
                    contrast={0.3}
                    speed={0.25 * speed}
                />
            ) : null}
            <span className={styles.scrim} />
        </div>
    );
}
