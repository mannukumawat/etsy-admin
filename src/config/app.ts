import {
  MessageSquareText,
  BadgePercent,
  Boxes,
  FileText,
  FolderTree,
  Globe2,
  Home,
  Image,
  Languages,
  LayoutDashboard,
  Layers,
  Link2,
  Package,
  Receipt,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export const APP = {
  name: 'Your Store Admin',
  /** The storefront is a separate app; admin changes do NOT update it in this phase. */
  storefrontUrl: (import.meta.env.VITE_STOREFRONT_URL as string | undefined) || 'http://localhost:5173',
  demoBanner: 'Demo mode — changes stay in this admin preview and reset on refresh. The storefront is not updated.',
};

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: Package },
      { to: '/categories', label: 'Categories', icon: FolderTree },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/media', label: 'Media', icon: Image },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingBag },
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/coupons', label: 'Coupons', icon: BadgePercent },
      { to: '/reviews', label: 'Reviews', icon: MessageSquareText },
      { to: '/returns', label: 'Returns', icon: RotateCcw },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/content/homepage', label: 'Homepage', icon: Home },
      { to: '/content/pages', label: 'Pages', icon: FileText },
      { to: '/navigation', label: 'Navigation', icon: Link2 },
      { to: '/collections', label: 'Collections', icon: Layers },
      { to: '/translations', label: 'Translations', icon: Languages },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/settings/store', label: 'Store', icon: Store },
      { to: '/settings/shipping', label: 'Shipping', icon: Truck },
      { to: '/settings/tax', label: 'Tax', icon: Receipt },
      { to: '/settings/currencies', label: 'Currencies', icon: Globe2 },
    ],
  },
];

export const SETTINGS_ICON = Settings2;
