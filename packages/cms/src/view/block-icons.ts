import {
    Blocks,
    Calendar,
    CircleHelp,
    Code,
    Columns2,
    FileText,
    Image,
    Images,
    Info,
    Leaf,
    Link,
    List,
    Mail,
    MapPin,
    Megaphone,
    MousePointerClick,
    Newspaper,
    Quote,
    ShoppingBag,
    Star,
    Table,
    TriangleAlert,
    User,
    Users,
    Video,
    type LucideIcon,
} from 'lucide-react';
import type { BlockIcon } from '../block.js';

const ICONS: Record<BlockIcon, LucideIcon> = {
    article: Newspaper,
    button: MousePointerClick,
    calendar: Calendar,
    code: Code,
    columns: Columns2,
    file: FileText,
    gallery: Images,
    image: Image,
    info: Info,
    leaf: Leaf,
    link: Link,
    list: List,
    mail: Mail,
    map: MapPin,
    megaphone: Megaphone,
    person: User,
    people: Users,
    product: ShoppingBag,
    question: CircleHelp,
    quote: Quote,
    star: Star,
    table: Table,
    video: Video,
    warning: TriangleAlert,
};

/**
 * The icon a block shows beside its label: the one it names, or a generic
 * block icon.
 */
export const blockIconOf = (name: string | undefined): LucideIcon =>
    name !== undefined && Object.hasOwn(ICONS, name) ? ICONS[name as BlockIcon] : Blocks;
