/**
 * Items characters are built from, gathered from every Item compendium the
 * user can see and the world's Items directory: abilities, skills and racial
 * skills. Used by the character builder and by racial skills that ask for a
 * choice.
 */

/**
 * Every item of a type, one per name (the first found wins, compendiums
 * before the world), sorted by name.
 * @param {string} type        The item type, such as 'ability'
 * @param {string[]} [fields]  Extra fields to load from compendium indexes, such as 'system.minRank'
 * @returns {Promise<{uuid: string, name: string, img: string, group: string, system: object}[]>}
 */
export async function itemCatalog(type, fields = []) {
  const byName = new Map();
  const add = (entry, group) => {
    const key = entry.name.toLowerCase();
    if (entry.type !== type || byName.has(key)) return;
    byName.set(key, {
      uuid: entry.uuid,
      name: entry.name,
      img: entry.img || Item.implementation.DEFAULT_ICON,
      group,
      system: entry.system ?? {},
    });
  };

  for (const pack of game.packs.filter((p) => p.documentName === 'Item' && p.visible)) {
    const index = await pack.getIndex({ fields: ['type', 'folder', 'img', ...fields] });
    for (const entry of index) add(entry, pack.folders.get(entry.folder)?.name ?? pack.title);
  }
  const world = game.i18n.localize('NOQUARTER.Builder.WorldItems');
  for (const item of game.items) if (item.visible) add(item, item.folder?.name ?? world);

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Copy a catalog item's data, ready to be given to a character.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function catalogItemData(uuid) {
  const item = await fromUuid(uuid);
  if (!item) return null;
  return item.inCompendium ? game.items.fromCompendium(item, { clearFolder: true }) : item.toObject();
}

/** The fields the builder needs from an ability's compendium entry. */
export const ABILITY_FIELDS = [
  'system.actionType',
  'system.stats',
  'system.minRank',
  'system.maxRank',
  'system.staminaCost',
  'system.effect',
  'system.special',
];

/** The fields needed from a racial skill's compendium entry. */
export const RACIAL_SKILL_FIELDS = [
  'system.choice',
  'system.repeatable',
  'system.exclusive',
  'system.health',
  'system.stamina',
  'system.speed',
  'system.vision',
];
