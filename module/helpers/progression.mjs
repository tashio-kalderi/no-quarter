import { NOQUARTER } from './config.mjs';

/**
 * Character progression: what each level gives a character, and how much of
 * it they've spent. The table is a world setting the GM can change in the
 * Character Progression settings window (applications/progression-config.mjs).
 */

/**
 * What each level gives, from level 1 to NOQUARTER.maxLevel: stat points,
 * ability points and skills gained on reaching it, and the highest rank a stat
 * can have at that level. Level 1 is what a new character starts with.
 * @returns {{statPoints: number, abilityPoints: number, skills: number, statCap: number}[]}
 */
export function defaultProgression() {
  const rows = [];
  for (let level = 1; level <= NOQUARTER.maxLevel; level++) {
    const start = level === 1;
    rows.push({
      statPoints: start ? 4 : 1,
      abilityPoints: start ? 4 : 3,
      skills: start ? 3 : [3, 6, 9].includes(level) ? 1 : 0,
      statCap: level >= 9 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2,
    });
  }
  return rows;
}

/** Register the progression settings and their settings window. Called on init. */
export function registerProgressionSettings(ProgressionConfig) {
  const fields = foundry.data.fields;
  const count = { required: true, nullable: false, integer: true, min: 0 };
  game.settings.register('no-quarter', 'progression', {
    scope: 'world',
    config: false,
    type: new fields.ArrayField(
      new fields.SchemaField({
        statPoints: new fields.NumberField(count),
        abilityPoints: new fields.NumberField(count),
        skills: new fields.NumberField(count),
        statCap: new fields.NumberField({ ...count, max: NOQUARTER.successRules.maxRank }),
      })
    ),
    default: defaultProgression(),
    // Characters' point totals depend on it.
    onChange: () => refreshCharacters(),
  });
  // Whether points spent at earlier levels can be taken back and spent again
  // while building or levelling up a character, or are locked in.
  game.settings.register('no-quarter', 'freeRespec', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });
  game.settings.registerMenu('no-quarter', 'progressionMenu', {
    name: 'NOQUARTER.Progression.Title',
    label: 'NOQUARTER.Progression.Configure',
    hint: 'NOQUARTER.Progression.Hint',
    icon: 'fa-solid fa-stairs',
    type: ProgressionConfig,
    restricted: true,
  });
}

/**
 * The progression table, one row per level. Missing or broken rows fall back
 * to the default for that level.
 * @returns {{statPoints: number, abilityPoints: number, skills: number, statCap: number}[]}
 */
export function progressionTable() {
  const defaults = defaultProgression();
  let saved = [];
  try {
    saved = game.settings.get('no-quarter', 'progression') ?? [];
  } catch {
    // Not registered yet.
  }
  return defaults.map((row, i) => {
    const custom = saved[i] ?? {};
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, Number.isInteger(custom[key]) ? custom[key] : value])
    );
  });
}

/**
 * Everything a character has earned by a level: points and skills from every
 * level up to it, and that level's stat cap.
 * @param {number} level
 * @returns {{level: number, statPoints: number, abilityPoints: number, skills: number, statCap: number}}
 */
export function earnedAtLevel(level) {
  const table = progressionTable();
  const reached = Math.clamp(Math.trunc(level) || 1, 1, table.length);
  const earned = { level: reached, statPoints: 0, abilityPoints: 0, skills: 0, statCap: table[reached - 1].statCap };
  for (const row of table.slice(0, reached)) {
    earned.statPoints += row.statPoints;
    earned.abilityPoints += row.abilityPoints;
    earned.skills += row.skills;
  }
  return earned;
}

/**
 * What a racial skill asks for when it's taken: 'stat', 'skill', 'ability' or
 * '' for nothing. The SRD Ability racial skill always asks for an ability,
 * even from a compendium built before it had that choice, and so do copies
 * taken from it before then.
 * @param {Item} item   A racial skill, owned or not
 * @returns {string}
 */
export function racialSkillChoice(item) {
  if (item.system.choice) return item.system.choice;
  const id = NOQUARTER.racialAbilityId;
  const sources = [item.inCompendium ? item.uuid : null, item._stats?.compendiumSource];
  return sources.some((s) => s?.endsWith(id)) ? 'ability' : '';
}

/**
 * The racial Ability skill gives a free rank in an ability.
 * @param {Item} item
 * @returns {boolean}
 */
function isRacialAbility(item) {
  return item.type === 'racialSkill' && racialSkillChoice(item) === 'ability';
}

/**
 * A character's stat points, ability points and skills: how many they've
 * earned by their level, spent, and have left. Unspent points carry over.
 * Spending is worked out from what the character has: every stat rank and
 * ability rank costs one point, and every skill counts. What racial skills
 * give (Stat Increase, Ability, Profession) comes on top, so it's taken off.
 * Stats are counted as allocated, without effects.
 * @param {Actor} actor   A character
 */
export function characterProgression(actor) {
  const earned = earnedAtLevel(actor.system.attributes.level.value);
  const racial = actor.items.filter((i) => i.type === 'racialSkill');

  const statRanks = Object.values(actor._source.system.stats).reduce((sum, s) => sum + (s.value ?? 0), 0);
  const statIncreases = racial.filter((i) => i.system.choice === 'stat' && i.system.stat).length;

  const abilityRanks = actor.items
    .filter((i) => i.type === 'ability')
    .reduce((sum, i) => sum + (i._source.system.rank ?? 0), 0);
  const racialAbilities = racial.filter(isRacialAbility).length;

  const skillCount = actor.items.filter((i) => i.type === 'skill').length;
  const professionSkills = racial.filter((i) => i.system.choice === 'skill' && i.system.linkedSkill).length;

  const pool = (total, spent) => ({ earned: total, spent, remaining: total - spent });
  return {
    level: earned.level,
    statCap: earned.statCap,
    stats: pool(earned.statPoints, Math.max(0, statRanks - statIncreases)),
    abilities: pool(earned.abilityPoints, Math.max(0, abilityRanks - racialAbilities)),
    skills: pool(earned.skills, Math.max(0, skillCount - professionSkills)),
  };
}

/** Recalculate every character's point totals, after the table changes. */
function refreshCharacters() {
  for (const actor of game.actors) {
    if (actor.type !== 'character') continue;
    actor.reset();
    if (actor.sheet?.rendered) actor.sheet.render();
  }
}
