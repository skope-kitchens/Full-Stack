/**
 * menuVisibility.js — single source of truth for hiding soft-deleted menu items.
 *
 * Menu items live as subdocuments inside MenuEntry.items[]. A soft-deleted item
 * carries isDeleted: true (BUG-001 fix). Because items is an array, the filter
 * can't be a plain query clause — every read path drops deleted items in JS after
 * .lean(). Centralised here so all five consumers (client, local kitchen, head
 * chef, POC, recipe-admin queue) behave identically.
 *
 * Returns a NEW array; does not mutate the input. Tolerates entries with no items.
 */
export function stripDeletedMenuItems(entries = []) {
  if (!Array.isArray(entries)) return entries;
  return entries.map((entry) => ({
    ...entry,
    items: Array.isArray(entry?.items)
      ? entry.items.filter((it) => !it?.isDeleted)
      : entry?.items,
  }));
}
