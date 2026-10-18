import { ABILITY_FIELDS, catalogItemData, itemCatalog } from './catalog.mjs';
import { racialSkillChoice } from './progression.mjs';

/**
 * Giving a character racial skills and skills, from a drop onto the sheet or
 * from the character builder. Only characters can have them, up to
 * NOQUARTER.maxRacialSkills racial skills. A racial skill can only be taken
 * twice if it's repeatable, and an exclusive one (Flight) can't be taken with
 * any other. One that asks for a choice asks for it first:
 * - Stat Increase: which stat, which gains a rank,
 * - Profession: which skill, which is added and linked to it,
 * - Ability: which ability, which gains a rank (added at rank 1 if new).
 * Removing the racial skill takes back the skill or rank (see
 * NoQuarterActor#_onDeleteDescendantDocuments), and changing a Stat
 * Increase's stat moves the rank (see NoQuarterItem#_onUpdate).
 */

/**
 * Whether an owned item is a copy of a racial skill. A skill from the
 * compendium remembers where it came from, so a renamed copy still counts.
 * @param {Item} owned   An item the actor has
 * @param {Item} item    The racial skill to compare it with
 * @returns {boolean}
 */
export function isSameRacialSkill(owned, item) {
  if (owned.type !== 'racialSkill') return false;
  const source = item.inCompendium ? item.uuid : item._stats.compendiumSource;
  return owned.name === item.name || (!!source && owned._stats.compendiumSource === source);
}

/**
 * Why a racial skill can't be added to an actor, if it can't.
 * @param {Actor} actor
 * @param {Item} item   The racial skill
 * @returns {string|undefined}   The warning to show
 */
export function racialSkillProblem(actor, item) {
  const i18n = (key, data = {}) => game.i18n.format(key, data);
  if (actor.type !== 'character') return i18n('NOQUARTER.RacialSkill.CharactersOnly');
  const owned = actor.items.filter((i) => i.type === 'racialSkill');

  const exclusive = owned.find((i) => i.system.exclusive);
  if (exclusive) return i18n('NOQUARTER.RacialSkill.Exclusive', { name: exclusive.name });
  if (item.system.exclusive && owned.length) return i18n('NOQUARTER.RacialSkill.Exclusive', { name: item.name });

  const duplicate = owned.some((i) => isSameRacialSkill(i, item));
  if (duplicate && !item.system.repeatable) return i18n('NOQUARTER.RacialSkill.Duplicate');
  if (owned.length >= CONFIG.NOQUARTER.maxRacialSkills) {
    return i18n('NOQUARTER.RacialSkill.Limit', { max: CONFIG.NOQUARTER.maxRacialSkills });
  }
}

/**
 * Give a character a racial skill, asking for its choice first if it has one.
 * @param {Actor} actor
 * @param {Item} item   The racial skill, from a compendium, the world or another actor
 * @returns {Promise<Item|null>}   The racial skill added, or null if it wasn't
 */
export async function addRacialSkill(actor, item) {
  if (!actor.isOwner) return null;
  const problem = racialSkillProblem(actor, item);
  if (problem) {
    ui.notifications.warn(problem);
    return null;
  }

  const data = item.inCompendium ? game.items.fromCompendium(item, { clearFolder: true }) : item.toObject();
  delete data._id;
  const choice = racialSkillChoice(item);
  data.system.choice = choice;

  if (choice === 'stat') {
    // A Stat Increase raises its stat a rank straight away. The racial skill
    // comes first: it's what pays for the rank.
    const stat = await chooseStat(actor, item);
    if (!stat) return null;
    data.system.stat = stat;
    const created = await Item.implementation.create(data, { parent: actor });
    if (!created) return null;
    const value = actor._source.system.stats[stat]?.value ?? 0;
    const raised = await actor.update({ [`system.stats.${stat}.value`]: value + 1 }, { noQuarterRacialStat: true });
    // Without the rank it gives, the racial skill is taken back off.
    if (!raised) await created.delete();
    return raised ? created : null;
  }

  if (choice === 'skill') {
    // A Profession also adds the skill it's for to the character's skills,
    // linked by id so that removing the Profession removes the skill too.
    const skill = await chooseSkill(actor, item);
    if (!skill) return null;
    skill._id = foundry.utils.randomID();
    data._id = foundry.utils.randomID();
    data.system.skill = skill.name;
    data.system.skillId = skill._id;
    // The skill comes on top of the character's own skills (see helpers/build-mode.mjs).
    const [created] = await actor.createEmbeddedDocuments('Item', [data, skill], {
      keepId: true,
      professionSkill: skill._id,
    });
    return created ?? null;
  }

  if (choice === 'ability') {
    const picked = await chooseAbility(actor, item);
    if (!picked) return null;
    // The racial skill comes first: it's what pays for the rank.
    const abilityId = picked.owned?.id ?? foundry.utils.randomID();
    data.system.ability = picked.owned?.name ?? picked.data.name;
    data.system.abilityId = abilityId;
    const created = await Item.implementation.create(data, { parent: actor });
    if (!created) return null;
    const granted = picked.owned
      ? await picked.owned.update({ 'system.rank': (picked.owned.system.rank ?? 0) + 1 })
      : await Item.implementation.create(
          { ...picked.data, _id: abilityId, system: { ...picked.data.system, rank: 1 } },
          { parent: actor, keepId: true }
        );
    // Without the rank it gives, the racial skill is taken back off.
    if (!granted) await created.delete();
    return granted ? created : null;
  }

  return (await Item.implementation.create(data, { parent: actor })) ?? null;
}

/**
 * Give a character a skill, unless it already has one by that name.
 * @param {Actor} actor
 * @param {object} data   The skill's data
 * @returns {Promise<Item|null>}
 */
export async function addSkill(actor, data) {
  if (actor.type !== 'character') {
    ui.notifications.warn('NOQUARTER.Skill.CharactersOnly', { localize: true });
    return null;
  }
  const name = data.name.toLowerCase();
  if (actor.items.some((i) => i.type === 'skill' && i.name.toLowerCase() === name)) {
    ui.notifications.warn(game.i18n.format('NOQUARTER.Skill.Duplicate', { name: data.name }));
    return null;
  }
  return (await Item.implementation.create({ ...data, type: 'skill' }, { parent: actor })) ?? null;
}

/**
 * Ask which stat a racial skill is for, leaving out the stats the character
 * already picked for other copies of it.
 * @param {Actor} actor
 * @param {Item} item   The racial skill
 * @returns {Promise<string|null>}   The stat, or null if none is left or the dialog was closed
 */
async function chooseStat(actor, item) {
  const taken = new Set(actor.items.filter((i) => isSameRacialSkill(i, item)).map((i) => i.system.stat));
  // A racial increase still can't take a stat past the cap for the
  // character's level, so one that's already there isn't offered, to the GM
  // either. (The GM can still type any value on the sheet.)
  const { statCap } = actor.system.progression;
  const stats = actor._source.system.stats;
  for (const key of Object.keys(CONFIG.NOQUARTER.stats)) if ((stats[key]?.value ?? 0) >= statCap) taken.add(key);
  const options = Object.entries(CONFIG.NOQUARTER.stats)
    .filter(([key]) => !taken.has(key))
    .map(([key, label]) => `<option value="${key}">${game.i18n.localize(label)}</option>`);
  if (!options.length) {
    ui.notifications.warn(game.i18n.format('NOQUARTER.RacialSkill.AllStatsChosen', { name: item.name }));
    return null;
  }
  return foundry.applications.api.DialogV2.prompt({
    window: { title: item.name, icon: 'fa-solid fa-arrow-up' },
    content: `<p>${game.i18n.format('NOQUARTER.RacialSkill.ChooseStat', { name: item.name })}</p>
      <select name="stat" autofocus>${options.join('')}</select>`,
    ok: { label: 'NOQUARTER.RacialSkill.Choose', callback: (event, button) => button.form.elements.stat.value },
    rejectClose: false,
  });
}

/**
 * Ask which skill a racial skill adds: one from the compendiums, or any
 * skill typed by name. Skills the character already has aren't offered.
 * @param {Actor} actor
 * @param {Item} item   The racial skill
 * @returns {Promise<object|null>}   The new skill's data, or null if none was chosen
 */
async function chooseSkill(actor, item) {
  const owned = new Set(actor.items.filter((i) => i.type === 'skill').map((i) => i.name.toLowerCase()));
  const catalog = (await itemCatalog('skill')).filter((e) => !owned.has(e.name.toLowerCase()));
  const byName = new Map(catalog.map((e) => [e.name.toLowerCase(), e]));

  const esc = foundry.utils.escapeHTML;
  const i18n = (key) => game.i18n.localize(key);
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title: item.name, icon: 'fa-solid fa-book' },
    content: `<p>${game.i18n.format('NOQUARTER.RacialSkill.ChooseSkill', { name: item.name })}</p>
      <div class="form-group">
        <label>${i18n('NOQUARTER.RacialSkill.SkillFromCompendium')}</label>
        <select name="uuid" autofocus><option value=""></option>${groupedOptions(catalog)}</select>
      </div>
      <div class="form-group">
        <label>${i18n('NOQUARTER.RacialSkill.SkillByName')}</label>
        <input type="text" name="name">
      </div>`,
    ok: {
      label: 'NOQUARTER.RacialSkill.Choose',
      callback: (event, button) => ({
        uuid: button.form.elements.uuid.value,
        name: button.form.elements.name.value.trim(),
      }),
    },
    rejectClose: false,
  });
  if (!picked) return null;

  // A typed name wins over the list, and uses the compendium's skill if it has one by that name.
  let uuid = picked.uuid;
  if (picked.name) {
    if (owned.has(picked.name.toLowerCase())) {
      ui.notifications.warn(game.i18n.format('NOQUARTER.Skill.Duplicate', { name: picked.name }));
      return null;
    }
    uuid = byName.get(picked.name.toLowerCase())?.uuid;
    if (!uuid) return { name: picked.name, type: 'skill' };
  }
  if (!uuid) {
    ui.notifications.warn('NOQUARTER.RacialSkill.NoSkillChosen', { localize: true });
    return null;
  }
  const data = await catalogItemData(uuid);
  delete data?._id;
  return data;
}

/**
 * Ask which ability a racial Ability skill gives a rank in: one the character
 * has that can go a rank higher, or a new one whose minimum rank is 1. Each
 * copy of the racial skill must be for a different ability, and the new rank
 * can't be above the ability's highest stat.
 * @param {Actor} actor
 * @param {Item} item   The racial skill
 * @returns {Promise<{owned?: Item, data?: object}|null>}
 */
async function chooseAbility(actor, item) {
  const base = actor._source.system.stats;
  const highest = (stats) => Math.max(0, ...[...(stats ?? [])].map((k) => base[k]?.value ?? 0));
  const owned = rankableAbilities(actor, item);
  const ownedNames = new Set(actor.items.filter((i) => i.type === 'ability').map((i) => i.name.toLowerCase()));
  const catalog = (await itemCatalog('ability', ABILITY_FIELDS)).filter(
    (e) =>
      !ownedNames.has(e.name.toLowerCase()) &&
      (e.system.minRank ?? 1) <= 1 &&
      highest(e.system.stats) >= 1
  );

  if (!owned.length && !catalog.length) {
    ui.notifications.warn(game.i18n.format('NOQUARTER.RacialSkill.NoAbilityLeft', { name: item.name }));
    return null;
  }

  const esc = foundry.utils.escapeHTML;
  const ownedGroup = owned.length
    ? `<optgroup label="${esc(game.i18n.localize('NOQUARTER.RacialSkill.OwnedAbilities'))}">${owned
        .map((i) => `<option value="owned:${i.id}">${esc(i.name)} (${i.system.rank ?? 0} → ${(i.system.rank ?? 0) + 1})</option>`)
        .join('')}</optgroup>`
    : '';
  const value = await foundry.applications.api.DialogV2.prompt({
    window: { title: item.name, icon: 'fa-solid fa-star' },
    content: `<p>${game.i18n.format('NOQUARTER.RacialSkill.ChooseAbility', { name: item.name })}</p>
      <select name="ability" autofocus>${ownedGroup}${groupedOptions(catalog)}</select>`,
    ok: { label: 'NOQUARTER.RacialSkill.Choose', callback: (event, button) => button.form.elements.ability.value },
    rejectClose: false,
  });
  if (!value) return null;
  if (value.startsWith('owned:')) return { owned: actor.items.get(value.slice(6)) };
  const data = await catalogItemData(value);
  if (!data) return null;
  delete data._id;
  return { data };
}

/**
 * The character's abilities a racial Ability skill could give a rank in: ones
 * the next rank is allowed for (within its range and not above its highest
 * stat), leaving out ones other copies of the racial skill are already for.
 * This applies to the GM too, like the builder; the GM can still type any
 * rank on the sheet.
 * @param {Actor} actor
 * @param {Item} item   The racial skill
 * @returns {Item[]}
 */
export function rankableAbilities(actor, item) {
  const base = actor._source.system.stats;
  const highest = (stats) => Math.max(0, ...[...(stats ?? [])].map((k) => base[k]?.value ?? 0));
  const taken = new Set(
    actor.items
      .filter((i) => i.id !== item.id && isSameRacialSkill(i, item))
      .map((i) => i.system.abilityId)
      .filter(Boolean)
  );
  return actor.items.filter((i) => {
    if (i.type !== 'ability' || taken.has(i.id)) return false;
    const rank = i.system.rank ?? 0;
    const next = rank + 1;
    if (rank === 0 && next < i.system.minRank) return false;
    if (next > i.system.maxRank) return false;
    return next <= highest(i.system.stats);
  });
}

/**
 * `<optgroup>`s of catalog entries, grouped by folder.
 * @param {object[]} entries   From itemCatalog
 * @returns {string}
 */
function groupedOptions(entries) {
  const esc = foundry.utils.escapeHTML;
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, list]) => {
      const options = list.map((e) => `<option value="${e.uuid}">${esc(e.name)}</option>`);
      return `<optgroup label="${esc(group)}">${options.join('')}</optgroup>`;
    })
    .join('');
}
