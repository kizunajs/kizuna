import type { MDXComponents } from 'mdx/types';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

import { AdapterTabs } from './adapter-tabs';
import { CodeBlock } from './code-block';
import { Card, Cards } from './cards';
import { AccessStyle, AccessStyleSwitch } from './access-style';
import { ConfigExplorer } from '@/components/code/config-explorer';
import { AlphaNotice } from './alpha-notice';
import { BetaNotice } from './beta-notice';
import { InstallTabs } from './install-tabs';
import { FeatureList } from './feature-list';
import { ChangeCost } from './change-cost';
import { StandardsTable } from './standards-table';
import { GeneratedSurfaces } from './generated-surfaces';
import { Supports } from './supports';

import blockStyles from './mdx-block.module.css';

export function getMDXComponents(components: MDXComponents): MDXComponents {
    return {
        ...components,
        pre: CodeBlock,
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
        AlphaNotice,
        BetaNotice,
        InstallTabs,
        FeatureList,
        ChangeCost,
        StandardsTable,
        GeneratedSurfaces,
        Supports,
    };
}
