import type { MDXComponents } from 'mdx/types';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

import { AdapterTabs } from './adapter-tabs';
import { AccessStyle, AccessStyleSwitch } from './access-style';
import { ConfigExplorer } from '@/components/code/config-explorer';
import { HandlerExplorer } from '@/components/code/handler-explorer';
import { AlphaNotice } from './alpha-notice';
import { BetaNotice } from './beta-notice';
import { InstallTabs } from './install-tabs';
import { ExtensionCard } from './extension-card';
import { FeatureList } from './feature-list';
import { GeneratedSurfaces } from './generated-surfaces';
import { Supports } from './supports';

import blockStyles from './mdx-block.module.css';

export function getMDXComponents(components: MDXComponents): MDXComponents {
    return {
        ...components,
        Popup,
        PopupContent,
        PopupTrigger,
        Card,
        Cards,
        Step,
        Steps,
        Tab,
        Tabs,
        AdapterTabs,
        AccessStyle,
        AccessStyleSwitch,
        ConfigExplorer: () => <ConfigExplorer className={blockStyles.block} />,
        HandlerExplorer: () => <HandlerExplorer className={blockStyles.block} />,
        AlphaNotice,
        BetaNotice,
        InstallTabs,
        ExtensionCard,
        FeatureList,
        GeneratedSurfaces,
        Supports,
    };
}
