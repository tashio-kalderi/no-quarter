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
 * Abilities every character has. Listed in display order, at the top of the
 * Abilities list.
 * @type {Object}
 */
NOQUARTER.basicAbilities = {
  melee: { name: 'NOQUARTER.BasicAbility.Melee', stat: 'might' },
  ranged: { name: 'NOQUARTER.BasicAbility.Ranged', stat: 'agility' },
  magic: { name: 'NOQUARTER.BasicAbility.Magic', stat: 'mind' },
};

/**
 * The kinds of damage a monster ability can deal. Monsters reduce them with
 * their PDR (physical) and MDR (magical).
 * @type {Object}
 */
NOQUARTER.damageTypes = {
  physical: 'NOQUARTER.DamageType.Physical',
  magic: 'NOQUARTER.DamageType.Magic',
};
