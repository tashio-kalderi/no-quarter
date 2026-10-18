export const NOQUARTER = {};

/**
 * The set of Stats used within the system.
 * @type {Object}
 */
NOQUARTER.stats = {
  might: 'NOQUARTER.Stat.Might.long',
  mind: 'NOQUARTER.Stat.Mind.long',
  agility: 'NOQUARTER.Stat.Agility.long',
  personality: 'NOQUARTER.Stat.Personality.long',
};

NOQUARTER.statAbbreviations = {
  might: 'NOQUARTER.Stat.Might.abbr',
  mind: 'NOQUARTER.Stat.Mind.abbr',
  agility: 'NOQUARTER.Stat.Agility.abbr',
  personality: 'NOQUARTER.Stat.Personality.abbr',
};

/**
 * Success chance rules. Rolls are d100 and succeed on a result equal to or
 * lower than the chance. Regular is `base + step` per rank; Greater is half
 * of Regular and Extreme is half of Greater, once the required rank is reached.
 * For stats the rank is the stat's rank; for abilities it is the ability's rank.
 * @type {Object}
 */
NOQUARTER.successRules = {
  maxRank: 5,
  base: 30,
  step: 10,
  greaterRank: 3,
  extremeRank: 5,
};

NOQUARTER.successDegrees = {
  criticalSuccess: 'NOQUARTER.Success.CriticalSuccess',
  extreme: 'NOQUARTER.Success.Extreme',
  greater: 'NOQUARTER.Success.Greater',
  regular: 'NOQUARTER.Success.Regular',
  failure: 'NOQUARTER.Success.Failure',
  criticalFailure: 'NOQUARTER.Success.CriticalFailure',
};

/**
 * Extra damage added on top of an ability's damage for each degree of success.
 * A degree missing from this list (a failure) deals no damage.
 * @type {Object}
 */
NOQUARTER.damageBonus = {
  regular: 0,
  greater: 1,
  extreme: 2,
  criticalSuccess: 5,
};

/**
 * How a character's ability is used, in the order the sections appear on the
 * sheet. Full actions take the character's turn and are rolled; supplemental
 * abilities are added onto a full action; passive abilities are always on.
 * @type {Object}
 */
NOQUARTER.actionTypes = {
  full: { label: 'NOQUARTER.ActionType.full.label', section: 'NOQUARTER.ActionType.full.section' },
  supplemental: { label: 'NOQUARTER.ActionType.supplemental.label', section: 'NOQUARTER.ActionType.supplemental.section' },
  passive: { label: 'NOQUARTER.ActionType.passive.label', section: 'NOQUARTER.ActionType.passive.section' },
};

/**
 * Abilities every character has. Listed in display order, at the top of the
 * Abilities list.
 * @type {Object}
 */
NOQUARTER.basicAbilities = {
  melee: { name: 'NOQUARTER.BasicAbility.Melee', stats: ['might'], img: 'systems/no-quarter/assets/icons/basic_melee_attack.png' },
  ranged: { name: 'NOQUARTER.BasicAbility.Ranged', stats: ['agility'], img: 'systems/no-quarter/assets/icons/basic_ranged_attack.png' },
  magic: { name: 'NOQUARTER.BasicAbility.Magic', stats: ['mind'], img: 'systems/no-quarter/assets/icons/basic_magic_attack.png' },
};

/**
 * Short names for the basic attacks, used when an ability says which of them
 * it works with (`system.basicAttacks`).
 * @type {Object}
 */
/**
 * How often an ability's scaling value goes up by its step (see
 * NoQuarterAbility#scaledValue).
 * @type {Object}
 */
NOQUARTER.scalingModes = {
  perRank: 'NOQUARTER.Scaling.perRank',
  everyOtherRank: 'NOQUARTER.Scaling.everyOtherRank',
  fixed: 'NOQUARTER.Scaling.fixed',
};

/**
 * What the system does with an ability's scaling value by itself. "damage"
 * adds it to the damage of the basic attacks the ability is tied to; "pdr"
 * and "mdr" add it to the character's damage reduction.
 * @type {Object}
 */
NOQUARTER.abilityAutomations = {
  damage: 'NOQUARTER.Automation.damage',
  pdr: 'NOQUARTER.Automation.pdr',
  mdr: 'NOQUARTER.Automation.mdr',
};

NOQUARTER.basicAttacks = {
  melee: 'NOQUARTER.BasicAttack.Melee',
  ranged: 'NOQUARTER.BasicAttack.Ranged',
  magic: 'NOQUARTER.BasicAttack.Magic',
};

/**
 * Forms of vision a racial skill can grant, and how far each reaches in feet.
 * See helpers/vision.mjs for how they are applied to tokens.
 * @type {Object}
 */
NOQUARTER.visionTypes = {
  darkvision: { label: 'NOQUARTER.Vision.darkvision', range: 60 },
  earthsense: { label: 'NOQUARTER.Vision.earthsense', range: 60 },
  echolocation: { label: 'NOQUARTER.Vision.echolocation', range: 60 },
};

/**
 * What a racial skill can ask the player to pick when it is dropped onto a
 * character (see NoQuarterActorSheet#_onDropItem).
 * @type {Object}
 */
NOQUARTER.racialSkillChoices = {
  stat: 'NOQUARTER.RacialSkill.Choice.stat',
  skill: 'NOQUARTER.RacialSkill.Choice.skill',
  ability: 'NOQUARTER.RacialSkill.Choice.ability',
};

/**
 * The id of the Ability racial skill in the compendium, so copies taken
 * before it had the `ability` choice still count as a free ability rank (see
 * helpers/progression.mjs).
 * @type {string}
 */
NOQUARTER.racialAbilityId = 'toHT9UiZg7aSIyC4';

/**
 * The highest level a character can reach. What each level gives is set in
 * the Character Progression settings (see helpers/progression.mjs).
 * @type {number}
 */
NOQUARTER.maxLevel = 10;

/** How many racial skills a character can have. */
NOQUARTER.maxRacialSkills = 3;

/**
 * The kinds of damage a monster ability can deal. Monsters reduce them with
 * their PDR (physical) and MDR (magical).
 * @type {Object}
 */
NOQUARTER.damageTypes = {
  physical: 'NOQUARTER.DamageType.Physical',
  magic: 'NOQUARTER.DamageType.Magic',
};

/**
 * A boss with the Wounds boon dies when it has this many wounds. (A character
 * dies when its wounds reach its maximum health.)
 * @type {number}
 */
NOQUARTER.monsterMaxWounds = 3;

/**
 * Monster sizes and the token size (in grid squares) each one sets, as in
 * D&D and Pathfinder 2e.
 * @type {Object}
 */
NOQUARTER.sizes = {
  tiny: { label: 'NOQUARTER.Size.Tiny', token: 0.5 },
  sm: { label: 'NOQUARTER.Size.Small', token: 1 },
  med: { label: 'NOQUARTER.Size.Medium', token: 1 },
  lg: { label: 'NOQUARTER.Size.Large', token: 2 },
  huge: { label: 'NOQUARTER.Size.Huge', token: 3 },
  grg: { label: 'NOQUARTER.Size.Gargantuan', token: 4 },
};

/**
 * How a roll can be made. Advantage rolls twice and keeps the lower result
 * (lower is better); disadvantage rolls twice and keeps the higher.
 * @type {Object}
 */
NOQUARTER.rollModes = {
  normal: 'NOQUARTER.RollMode.Normal',
  advantage: 'NOQUARTER.RollMode.Advantage',
  disadvantage: 'NOQUARTER.RollMode.Disadvantage',
};
