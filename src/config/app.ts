import {
  MessageSquareText,
  ArrowLeftRight,
  BadgePercent,
  Bell,
  BookOpen,
  Boxes,
  FileText,
  FolderTree,
  Globe2,
  Home,
  Image,
  Info,
  Inbox,
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
  /** The storefront is a separate app that reads from the same backend, so in live
   *  mode admin changes reach it (it may need a page refresh to show them). */
  storefrontUrl: (import.meta.env.VITE_STOREFRONT_URL as string | undefined) || 'http://localhost:5173',
  /** Shown only in demo mode (no backend): changes stay in this admin preview and
   *  reset on refresh. In live mode the admin is connected to the backend. */
  demoBanner: 'Demo mode — changes stay in this admin preview and reset on refresh. The storefront is not updated.',
};

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** H12: live badge fed by a query key (see AdminLayout's NavList). */
  badge?: 'unreadNotifications';
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
      { to: '/item-groups', label: 'Item Groups', icon: Layers },
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
      { to: '/exchanges', label: 'Exchanges', icon: ArrowLeftRight },
      { to: '/contacts', label: 'Messages', icon: Inbox },
      { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'unreadNotifications' },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/help-center', label: 'Help Center', icon: BookOpen },
      { to: '/content/homepage', label: 'Homepage', icon: Home },
      { to: '/content/pages/about', label: 'About us', icon: Info },
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
