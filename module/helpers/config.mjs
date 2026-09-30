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
 * The skills every character has, keyed by id, each rolled with a stat.
 * Intimidation is listed twice on purpose: once for Might, once for
 * Personality. Characters can add more of their own on the Skills tab.
 * @type {Object<string, {name: string, stat: string}>}
 */
NOQUARTER.basicSkills = {
  athletics: { name: 'NOQUARTER.Skill.List.Athletics', stat: 'might' },
  construction: { name: 'NOQUARTER.Skill.List.Construction', stat: 'might' },
  intimidationMight: { name: 'NOQUARTER.Skill.List.Intimidation', stat: 'might' },
  insight: { name: 'NOQUARTER.Skill.List.Insight', stat: 'mind' },
  criminality: { name: 'NOQUARTER.Skill.List.Criminality', stat: 'mind' },
  searching: { name: 'NOQUARTER.Skill.List.Searching', stat: 'mind' },
  medicine: { name: 'NOQUARTER.Skill.List.Medicine', stat: 'mind' },
  herbalism: { name: 'NOQUARTER.Skill.List.Herbalism', stat: 'mind' },
  alchemy: { name: 'NOQUARTER.Skill.List.Alchemy', stat: 'mind' },
  magic: { name: 'NOQUARTER.Skill.List.Magic', stat: 'mind' },
  history: { name: 'NOQUARTER.Skill.List.History', stat: 'mind' },
  commerce: { name: 'NOQUARTER.Skill.List.Commerce', stat: 'mind' },
  religion: { name: 'NOQUARTER.Skill.List.Religion', stat: 'mind' },
  pickpocketing: { name: 'NOQUARTER.Skill.List.Pickpocketing', stat: 'agility' },
  lockpicking: { name: 'NOQUARTER.Skill.List.Lockpicking', stat: 'agility' },
  disableTraps: { name: 'NOQUARTER.Skill.List.DisableTraps', stat: 'agility' },
  gymnastics: { name: 'NOQUARTER.Skill.List.Gymnastics', stat: 'agility' },
  stealth: { name: 'NOQUARTER.Skill.List.Stealth', stat: 'agility' },
  persuasion: { name: 'NOQUARTER.Skill.List.Persuasion', stat: 'personality' },
  deception: { name: 'NOQUARTER.Skill.List.Deception', stat: 'personality' },
  intimidationPersonality: { name: 'NOQUARTER.Skill.List.Intimidation', stat: 'personality' },
  performance: { name: 'NOQUARTER.Skill.List.Performance', stat: 'personality' },
  music: { name: 'NOQUARTER.Skill.List.Music', stat: 'personality' },
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
