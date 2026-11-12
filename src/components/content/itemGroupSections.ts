import type { ItemGroup, Product } from '@/types';

/** How many products the storefront homepage shows per item group. */
export const ITEM_GROUP_HOME_LIMIT = 10;

export interface HomepageItemGroup {
  group: ItemGroup;
  products: Product[];
}

/**
 * Mirrors the storefront homepage: active item groups in position order, each with its active products
 * (first ITEM_GROUP_HOME_LIMIT), and groups without any product are skipped.
 */
export function buildHomepageItemGroups(groups: ItemGroup[] | undefined, products: Product[] | undefined): HomepageItemGroup[] {
  if (!groups || !products) return [];
  return [...groups]
    .filter((g) => g.isActive)
    .sort((a, b) => a.position - b.position)
    .map((group) => ({
      group,
      products: products.filter((p) => p.itemGroupId === group.id && p.status === 'active').slice(0, ITEM_GROUP_HOME_LIMIT),
    }))
    .filter((s) => s.products.length > 0);
}
