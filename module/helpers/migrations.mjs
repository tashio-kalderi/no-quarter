/**
 * One-off conversions of older world data, run by the GM when the world loads.
 */

/**
 * The fixed skill list characters had before skills became items, by the key
 * their trained checkbox was stored under. Intimidation was listed twice, once
 * for Might and once for Personality.
 * @type {Record<string, string>}
 */
export const LEGACY_SKILLS = {
  athletics: 'Athletics',
  construction: 'Construction',
  intimidationMight: 'Intimidation',
  insight: 'Insight',
  criminality: 'Criminality',
  searching: 'Searching',
  medicine: 'Medicine',
  herbalism: 'Herbalism',
  alchemy: 'Alchemy',
  magic: 'Magic',
  history: 'History',
  commerce: 'Commerce',
  religion: 'Religion',
  pickpocketing: 'Pickpocketing',
  lockpicking: 'Lockpicking',
  disableTraps: 'Disable Traps',
  gymnastics: 'Gymnastics',
  stealth: 'Stealth',
  persuasion: 'Persuasion',
  deception: 'Deception',
  intimidationPersonality: 'Intimidation',
  performance: 'Performance',
  music: 'Music',
};

/** Register the world settings that record which migrations have run. Called on init. */
export function registerMigrationSettings() {
  game.settings.register('no-quarter', 'abilityAttacksMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register('no-quarter', 'buildModeMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register('no-quarter', 'abilityActionTypesMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register('no-quarter', 'abilityAttackBoxMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });
}

/** Run every migration that's needed. Only the active GM does this. */
export async function migrateWorld() {
  if (!game.users.activeGM?.isSelf) return;
  await migrateSkillsToItems();
  await migrateAbilityAttacks();
  await migrateAbilityActionTypes();
  await migrateBuildMode();
  await migrateAbilityAttackBox();
}

/**
 * The attack box applies some supplemental abilities by itself (Bludgeon,
 * Lacerate, Feint, Strike Speed...), set by their automation, condition and
 * attack limit. Copies of SRD abilities taken before that have none of it, so
 * they get it from the compendium once. A copy that already has an automation
 * or attack limit was set up by hand and is left alone.
 */
async function migrateAbilityAttackBox() {
  if (game.settings.get('no-quarter', 'abilityAttackBoxMigrated')) return;
  const pack = game.packs.get('no-quarter.srd-characters');
  if (!pack) return;
  const sources = new Map();
  for (const doc of await pack.getDocuments({ type: 'ability' })) {
    if (doc.system.automation || doc.system.attackLimit) sources.set(doc.uuid, doc.system);
  }

  const updates = (items) =>
    items
      .filter((i) => i.type === 'ability' && sources.has(i._stats.compendiumSource))
      .filter((i) => !i.system.automation && !i.system.attackLimit)
      .map((i) => {
        const source = sources.get(i._stats.compendiumSource);
        const update = { _id: i.id, 'system.automation': source.automation, 'system.attackLimit': source.attackLimit };
        // A chosen condition (Impose Condition) stays as chosen.
        if (!i.system.conditionChoice) update['system.condition'] = source.condition;
        return update;
      });
  const options = { render: false };

  const worldItems = updates(game.items);
  if (worldItems.length) await Item.updateDocuments(worldItems, options);
  for (const actor of game.actors) {
    const data = updates(actor.items);
    if (data.length) await actor.updateEmbeddedDocuments('Item', data, options);
  }

  await game.settings.set('no-quarter', 'abilityAttackBoxMigrated', true);
}

/**
 * New characters start in build mode, but characters made before build mode
 * existed are already built, so they're taken out of it once.
 */
async function migrateBuildMode() {
  if (game.settings.get('no-quarter', 'buildModeMigrated')) return;
  const updates = game.actors
    .filter((a) => a.type === 'character')
    .map((a) => ({ _id: a.id, 'system.building': false }));
  if (updates.length) await Actor.updateDocuments(updates, { diff: false, render: false });
  await game.settings.set('no-quarter', 'buildModeMigrated', true);
}

/**
 * Abilities used to have a single `stat`, and no stat meant a passive one.
 * NoQuarterAbility.migrateData turns that into `stats` and an `actionType`
 * when they load; this saves the result once and removes the old field.
 * Monster abilities don't use either, so they're simply full actions.
 */
async function migrateAbilityActionTypes() {
  if (game.settings.get('no-quarter', 'abilityActionTypesMigrated')) return;

  const updates = (items, isMonster) =>
    items
      .filter((i) => i.type === 'ability')
      .map((i) => ({
        _id: i.id,
        'system.stats': isMonster ? [] : [...i._source.system.stats],
        'system.actionType': isMonster ? 'full' : i._source.system.actionType,
        'system.-=stat': null,
      }));
  const options = { diff: false, render: false };

  const worldItems = updates(game.items, false);
  if (worldItems.length) await Item.updateDocuments(worldItems, options);
  for (const actor of game.actors) {
    const data = updates(actor.items, actor.type === 'npc');
    if (data.length) await actor.updateEmbeddedDocuments('Item', data, options);
  }
  // Unlinked tokens keep their own changed copies of abilities.
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor || !token.delta?.items.size) continue;
      const data = updates(token.delta.items, token.actor.type === 'npc');
      if (data.length) await token.actor.updateEmbeddedDocuments('Item', data, options);
    }
  }

  await game.settings.set('no-quarter', 'abilityActionTypesMigrated', true);
}

/**
 * Abilities made before Attacks was added have no `attacks` saved, and their
 * leftover damage of 1 is cleared when they load (see
 * NoQuarterAbility.migrateData). Editing one only saves the changed field, so
 * without `attacks` saved the check would keep running on every load. This
 * saves `attacks` and `damage` on every ability once, so it stops.
 */
async function migrateAbilityAttacks() {
  if (game.settings.get('no-quarter', 'abilityAttacksMigrated')) return;

  // Send both fields even though they match what's loaded: `diff: false`
  // stops Foundry from dropping them as unchanged.
  const updates = (items) =>
    items
      .filter((i) => i.type === 'ability')
      .map((i) => ({ _id: i.id, 'system.attacks': i._source.system.attacks, 'system.damage': i._source.system.damage }));
  const options = { diff: false, render: false };

  const worldItems = updates(game.items);
  if (worldItems.length) await Item.updateDocuments(worldItems, options);
  for (const actor of game.actors) {
    const data = updates(actor.items);
    if (data.length) await actor.updateEmbeddedDocuments('Item', data, options);
  }
  // Unlinked tokens keep their own changed copies of abilities.
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor || !token.delta?.items.size) continue;
      const data = updates(token.delta.items);
      if (data.length) await token.actor.updateEmbeddedDocuments('Item', data, options);
    }
  }

  await game.settings.set('no-quarter', 'abilityAttacksMigrated', true);
}

/**
 * Skills used to be a fixed list with a Trained checkbox each, plus a list of
 * the character's own skills. Now they are items. Each character gets a skill
 * item for every basic skill they were trained in and every skill of their
 * own, taken from the SRD compendium when it has one by that name. The old
 * fields are then emptied so this only happens once.
 */
async function migrateSkillsToItems() {
  const characters = game.actors.filter((actor) => {
    if (actor.type !== 'character') return false;
    const { trainedSkills, skills } = actor.system._source;
    return Object.values(trainedSkills ?? {}).some(Boolean) || skills?.length;
  });
  if (!characters.length) return;

  const pack = game.packs.get('no-quarter.srd-characters');
  const index = await pack?.getIndex({ fields: ['type'] });
  const compendiumSkill = async (name) => {
    const entry = index?.find((e) => e.type === 'skill' && e.name.toLowerCase() === name.toLowerCase());
    if (!entry) return null;
    return game.items.fromCompendium(await pack.getDocument(entry._id), { clearFolder: true });
  };

  for (const actor of characters) {
    const { trainedSkills, skills } = actor.system._source;
    const names = [
      ...Object.entries(trainedSkills ?? {})
        .filter(([key, trained]) => trained && LEGACY_SKILLS[key])
        .map(([key]) => LEGACY_SKILLS[key]),
      ...(skills ?? []).map((skill) => skill.name.trim()).filter(Boolean),
    ];
    // Skip any the character already has, and Intimidation trained twice.
    const have = new Set(actor.items.filter((i) => i.type === 'skill').map((i) => i.name.toLowerCase()));
    const data = [];
    for (const name of names) {
      if (have.has(name.toLowerCase())) continue;
      have.add(name.toLowerCase());
      data.push((await compendiumSkill(name)) ?? { name, type: 'skill' });
    }

    if (data.length) await actor.createEmbeddedDocuments('Item', data);
    const cleared = Object.fromEntries(Object.keys(trainedSkills ?? {}).map((key) => [key, false]));
    await actor.update({ 'system.trainedSkills': cleared, 'system.skills': [] });
  }
  ui.notifications.info(game.i18n.format('NOQUARTER.Skill.Migrated', { count: characters.length }));
}
