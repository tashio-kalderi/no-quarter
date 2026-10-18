import { NOQUARTER } from './config.mjs';
import { earnedAtLevel } from './progression.mjs';

/**
 * Build mode: a character's stats, level, ability ranks, skills and racial
 * skills can only be changed by its player while it's being built or levelled
 * up. New characters start in it, raising the level turns it on again, and the
 * sheet has a button to enter and finish it. The GM can lock it, so players
 * can't enter it or level up themselves. GMs can always change anything.
 *
 * Finishing records what the character has, so when the GM turns free respec
 * off, those points can't be taken back later (see lockIn).
 */

/** The ability fields that are part of building a character, not just notes. */
const ABILITY_BUILD_FIELDS = ['rank', 'stats', 'actionType', 'minRank', 'maxRank'];

/** The item types a character builds with. */
const BUILD_ITEM_TYPES = ['ability', 'skill', 'racialSkill'];

/** Register the lock setting. Called on init. */
export function registerBuildModeSettings() {
  game.settings.register('no-quarter', 'lockBuilding', {
    name: 'NOQUARTER.Build.LockSetting',
    hint: 'NOQUARTER.Build.LockSettingHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    // Sheets show or hide the build button, and open builders show more or fewer steps.
    onChange: () => {
      for (const actor of game.actors) if (actor.type === 'character' && actor.sheet?.rendered) actor.sheet.render();
      for (const app of foundry.applications.instances.values()) {
        if (app.id.startsWith('no-quarter-builder-') && app.rendered) app.render();
      }
    },
  });
}

/** Whether the GM has locked character building. */
export function buildingLocked() {
  return game.settings.get('no-quarter', 'lockBuilding');
}

/** Whether points spent before can be taken back and spent again. */
function freeRespec() {
  return game.settings.get('no-quarter', 'freeRespec');
}

/**
 * What a character had when building was last finished: stat ranks on the
 * actor, and on each item whether it was there (and an ability's rank).
 */
const lockedStats = (actor) => actor.getFlag('no-quarter', 'lockedStats') ?? {};
const lockedRank = (item) => item.getFlag('no-quarter', 'locked');

/**
 * Warn the player and refuse a change.
 * @param {string} key      Localization key under NOQUARTER.Build
 * @param {object} [data]   Format data
 * @returns {false}
 */
function refuse(key, data) {
  ui.notifications.warn(game.i18n.format(`NOQUARTER.Build.${key}`, data ?? {}));
  return false;
}

const statLabel = (key) => game.i18n.localize(NOQUARTER.stats[key]);

/**
 * How many ranks of a stat the character's Stat Increase racial skills gave
 * it. They're added when the racial skill is taken and taken back with it, so
 * a player can't lower the stat below them.
 * @param {Actor} actor
 * @param {string} stat
 * @returns {number}
 */
export function racialStatBonus(actor, stat) {
  return actor.items.filter((i) => i.type === 'racialSkill' && i.system.choice === 'stat' && i.system.stat === stat)
    .length;
}

/**
 * The character's abilities whose rank would be above the highest of their
 * stats if those stats had these values.
 * @param {Actor} actor
 * @param {Record<string, number>} stats   Every stat's value
 * @param {Set<string>} lowered            The stats being lowered
 * @returns {Item[]}
 */
function abilitiesNeeding(actor, stats, lowered) {
  return actor.items.filter((i) => {
    if (i.type !== 'ability' || ![...i.system.stats].some((k) => lowered.has(k))) return false;
    const cap = Math.max(...[...i.system.stats].map((k) => stats[k] ?? 0));
    return (i.system.rank ?? 0) > cap;
  });
}

/**
 * Check a player's change to a character. Raising the level also turns build
 * mode on, by adding that to the changes.
 * @param {Actor} actor
 * @param {object} changes
 * @param {User} user
 * @param {object} [options]   The update options. `noQuarterRacialStat` marks a
 *                             Stat Increase being added or taken back, which
 *                             may move a stat past its racial ranks.
 * @returns {boolean}   Whether the change is allowed
 */
export function checkActorUpdate(actor, changes, user, options = {}) {
  if (actor.type !== 'character') return true;
  const get = (path) => foundry.utils.getProperty(changes, path);

  // Raising the level turns build mode on so the new points can be spent,
  // even when the GM raised it while building is locked.
  const level = get('system.attributes.level.value');
  const levelChanged = level !== undefined && level !== actor.system.attributes.level.value;
  if (levelChanged && level > actor.system.attributes.level.value) {
    foundry.utils.setProperty(changes, 'system.building', true);
  }
  if (user.isGM) return true;

  const locked = buildingLocked();
  if (levelChanged && locked) return refuse('LevelLocked');
  const building = get('system.building');
  if (building === true && !actor.system.building && !levelChanged && locked) return refuse('Locked');

  const stats = get('system.stats');
  if (!stats) return true;
  const base = actor._source.system.stats;
  const changed = Object.entries(stats)
    .map(([key, s]) => ({ key, value: s?.value, old: base[key]?.value ?? 0 }))
    .filter((s) => s.value !== undefined && s.value !== s.old);
  if (!changed.length) return true;
  if (!actor.system.building && building !== true) return refuse('NotBuilding');

  const earned = earnedAtLevel(level ?? actor.system.attributes.level.value);
  const floor = lockedStats(actor);
  const newStats = Object.fromEntries(Object.entries(base).map(([key, s]) => [key, s.value ?? 0]));
  for (const s of changed) newStats[s.key] = s.value;

  for (const { key, value, old } of changed) {
    if (value > old && value > earned.statCap) {
      return refuse('StatCap', { stat: statLabel(key), cap: earned.statCap, level: earned.level });
    }
    if (value < old && !options.noQuarterRacialStat) {
      const racial = racialStatBonus(actor, key);
      if (value < racial) return refuse('StatFromRacial', { stat: statLabel(key), value: racial });
      if (!freeRespec() && value < (floor[key] ?? 0)) {
        return refuse('StatLockedIn', { stat: statLabel(key), value: floor[key] });
      }
    }
  }

  // More points can't be spent than the character has; giving some back is fine.
  const progression = actor.system.progression;
  const delta = changed.reduce((sum, s) => sum + s.value - s.old, 0);
  if (delta > 0 && progression.stats.spent + delta > earned.statPoints) {
    return refuse('NoStatPoints', { remaining: earned.statPoints - progression.stats.spent });
  }

  // An ability's rank can't be above the highest of its stats, so a stat
  // can't be lowered below an ability that depends on it.
  const lowered = new Set(changed.filter((s) => s.value < s.old).map((s) => s.key));
  if (lowered.size) {
    const blocked = abilitiesNeeding(actor, newStats, lowered);
    if (blocked.length) {
      return refuse('StatNeeded', {
        stats: [...lowered].map(statLabel).join(', '),
        abilities: blocked.map((i) => i.name).join(', '),
      });
    }
  }
  return true;
}

/**
 * Check a player adding an ability, skill or racial skill to a character.
 * @param {Item} item       The item being created
 * @param {object} options  The creation options
 * @param {User} user
 * @returns {boolean}
 */
export function checkItemCreate(item, options, user) {
  const actor = item.actor;
  if (user.isGM || actor?.type !== 'character' || !BUILD_ITEM_TYPES.includes(item.type)) return true;
  // The basic abilities are given to every character automatically.
  if (item.system.basicKey) return true;
  if (!actor.system.building) return refuse('NotBuilding');

  const progression = actor.system.progression;
  if (item.type === 'ability') {
    const cost = item.system.rank ?? 0;
    if (cost > progression.abilities.remaining) {
      return refuse('NoAbilityPoints', { remaining: progression.abilities.remaining });
    }
  }
  // A skill added by a Profession comes on top (see NoQuarterActorSheet#_onDropItem).
  if (item.type === 'skill' && options.professionSkill !== item.id && progression.skills.remaining < 1) {
    return refuse('NoSkills');
  }
  return true;
}

/**
 * Check a player's change to a character's ability. Only its rank, stats,
 * action type and rank range are part of building; notes can be changed at
 * any time.
 * @param {Item} item
 * @param {object} changes
 * @param {User} user
 * @returns {boolean}
 */
export function checkItemUpdate(item, changes, user) {
  const actor = item.actor;
  if (user.isGM || actor?.type !== 'character' || item.type !== 'ability') return true;
  // Sheets send every field on each change, so only the ones whose value
  // actually changes count.
  const system = changes.system ?? {};
  const same = (field) => {
    const before = item._source.system[field];
    const after = system[field];
    if (field === 'stats') return [...(after ?? [])].sort().join() === [...(before ?? [])].sort().join();
    return (after ?? null) === (before ?? null);
  };
  const touched = ABILITY_BUILD_FIELDS.filter((f) => f in system && !same(f));
  if (!touched.length) return true;
  if (!actor.system.building) return refuse('NotBuilding');

  if (!touched.includes('rank')) return true;
  const rank = system.rank ?? 0;
  const old = item._source.system.rank ?? 0;
  const delta = rank - old;
  if (delta > 0 && delta > actor.system.progression.abilities.remaining) {
    return refuse('NoAbilityPoints', { remaining: actor.system.progression.abilities.remaining });
  }
  const floor = lockedRank(item);
  if (delta < 0 && !freeRespec() && typeof floor === 'number' && rank < floor) {
    return refuse('RankLockedIn', { name: item.name, rank: floor });
  }
  return true;
}

/**
 * Check a player removing an ability, skill or racial skill from a character.
 * @param {Item} item
 * @param {User} user
 * @returns {boolean}
 */
export function checkItemDelete(item, user) {
  const actor = item.actor;
  if (user.isGM || actor?.type !== 'character' || !BUILD_ITEM_TYPES.includes(item.type)) return true;
  if (!actor.system.building) return refuse('NotBuilding');
  if (!freeRespec() && lockedRank(item) !== undefined) return refuse('ItemLockedIn', { name: item.name });

  // A Stat Increase takes its rank back with it, which can't leave an ability
  // above the stat it needs.
  if (item.type === 'racialSkill' && item.system.choice === 'stat' && item.system.stat) {
    const key = item.system.stat;
    const stats = Object.fromEntries(Object.entries(actor._source.system.stats).map(([k, s]) => [k, s.value ?? 0]));
    stats[key] = Math.max(0, stats[key] - 1);
    const blocked = abilitiesNeeding(actor, stats, new Set([key]));
    if (blocked.length) {
      return refuse('StatNeeded', { stats: statLabel(key), abilities: blocked.map((i) => i.name).join(', ') });
    }
  }
  return true;
}

/**
 * Finish building: record what the character has now, so it can't be taken
 * back later if free respec is off, and leave build mode. When building is
 * locked, the player can't come back to spend points left over, so they're
 * asked first.
 * @param {Actor} actor
 * @returns {Promise<boolean>}   Whether building was finished
 */
export async function finishBuilding(actor) {
  const { stats, abilities, skills } = actor.system.progression;
  const leftover = stats.remaining > 0 || abilities.remaining > 0 || skills.remaining > 0;
  if (leftover && buildingLocked() && !game.user.isGM) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'NOQUARTER.Build.Finish' },
      content: `<p>${game.i18n.format('NOQUARTER.Build.UnspentWarning', {
        stats: stats.remaining,
        abilities: abilities.remaining,
        skills: skills.remaining,
      })}</p>`,
    });
    if (!proceed) return false;
  }

  const lockedStats = Object.fromEntries(
    Object.entries(actor._source.system.stats).map(([key, s]) => [key, s.value ?? 0])
  );
  const items = actor.items
    .filter((i) => BUILD_ITEM_TYPES.includes(i.type))
    .map((i) => ({ _id: i.id, 'flags.no-quarter.locked': i.type === 'ability' ? i._source.system.rank ?? 0 : true }));
  if (items.length) await actor.updateEmbeddedDocuments('Item', items);
  await actor.update({ 'system.building': false, 'flags.no-quarter.lockedStats': lockedStats });
  return true;
}
