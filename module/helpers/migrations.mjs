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

/** Run every migration that's needed. Only the active GM does this. */
export async function migrateWorld() {
  if (!game.users.activeGM?.isSelf) return;
  await migrateSkillsToItems();
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
