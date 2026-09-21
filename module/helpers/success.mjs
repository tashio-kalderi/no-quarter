import { NOQUARTER } from './config.mjs';

/**
 * Build the Regular/Greater/Extreme chances from a Regular chance. Greater and
 * Extreme are half of the previous tier, and stay 0 until `unlockRank` reaches
 * the rank that unlocks them.
 * @param {number} regular
 * @param {number} unlockRank
 * @returns {{regular: number, greater: number, extreme: number}}
 */
function tiers(regular, unlockRank) {
  const rules = NOQUARTER.successRules;
  const greater = unlockRank >= rules.greaterRank ? Math.floor(regular / 2) : 0;
  const extreme = unlockRank >= rules.extremeRank ? Math.floor(greater / 2) : 0;
  return { regular, greater, extreme };
}

/**
 * Calculate the success chances for a stat rank.
 * @param {number} rank
 */
export function successChances(rank) {
  const { base, step } = NOQUARTER.successRules;
  return tiers(base + step * rank, rank);
}

/**
 * Calculate the success chances for an ability: the stat's Regular chance plus
 * a step for each rank in the ability. Greater and Extreme are unlocked by the
 * rank of the ability, not the stat.
 * @param {number} statRank
 * @param {number} abilityRank
 */
export function abilityChances(statRank, abilityRank) {
  const { base, step } = NOQUARTER.successRules;
  return tiers(base + step * (statRank + abilityRank), abilityRank);
}

/**
 * Apply wounds to a d100 result. The first wound rounds the roll up to the
 * next multiple of 5 (a roll already on a multiple of 5 goes up by 5), and
 * each further wound adds another 5. A 67 becomes 70 with one wound and 75
 * with two.
 * @param {number} roll     The natural d100 result
 * @param {number} wounds
 * @returns {number}
 */
export function woundedRoll(roll, wounds) {
  if (!wounds) return roll;
  return Math.floor(roll / 5) * 5 + 5 * wounds;
}

/**
 * Determine how well a d100 result did against a set of success chances. A
 * natural 1 is always a critical success and a natural 100 a critical failure;
 * any other roll is adjusted for wounds first.
 * @param {number} natural   The natural d100 result
 * @param {{regular: number, greater: number, extreme: number}} chances
 * @param {number} [wounds=0]
 * @returns {'criticalSuccess'|'extreme'|'greater'|'regular'|'failure'|'criticalFailure'}
 */
export function successDegree(natural, chances, wounds = 0) {
  if (natural === 1) return 'criticalSuccess';
  if (natural === 100) return 'criticalFailure';
  const total = woundedRoll(natural, wounds);
  if (total <= chances.extreme) return 'extreme';
  if (total <= chances.greater) return 'greater';
  if (total <= chances.regular) return 'regular';
  return 'failure';
}

/**
 * Roll d100 against a set of success chances and post the result to chat.
 * The message shows the name and chances, the degree of success, the die roll
 * and, when a base damage is given, the damage dealt.
 * @param {object} options
 * @param {Actor} [options.actor]   The actor the roll is made for
 * @param {string} options.label    The name of the stat or ability rolled
 * @param {{regular: number, greater: number, extreme: number}} options.chances
 * @param {number} [options.damage]   Base damage; the degree of success adds to it
 * @param {string} [options.note]   Plain text shown under the roll, such as a monster ability's range and damage
 * @param {string} [options.tag]   Text shown in brackets after the name instead of the success chances, such as a monster ability's damage type and range
 * @returns {Promise<Roll>}
 */
export async function rollSuccess({ actor, label, chances, damage, note, tag }) {
  const roll = await new Roll('1d100').evaluate();
  const natural = roll.total;
  const wounds = actor?.usesWounds ? actor.system.wounds : 0;
  const total = woundedRoll(natural, wounds);
  const degree = successDegree(natural, chances, wounds);
  const { regular, greater, extreme } = chances;
  const result = game.i18n.localize(NOQUARTER.successDegrees[degree]);

  const bonus = NOQUARTER.damageBonus[degree];
  let damageHtml = '';
  if (damage !== undefined && bonus !== undefined) {
    const breakdown = bonus ? ` (${damage} + ${bonus})` : '';
    damageHtml = `<div class="roll-damage">${game.i18n.localize('NOQUARTER.Chat.Damage')}: <strong>${damage + bonus}</strong>${breakdown}</div>`;
  }

  const noteHtml = note ? `<div class="roll-effect">${foundry.utils.escapeHTML(note)}</div>` : '';

  const chancesHtml = tag === undefined
    ? ` <span class="roll-chances">(${regular}/${greater}/${extreme})</span>`
    : tag
      ? ` <span class="roll-chances">(${foundry.utils.escapeHTML(tag)})</span>`
      : '';

  const woundNote = wounds
    ? ` <span class="roll-wounds">(${game.i18n.format(
        wounds === 1 ? 'NOQUARTER.Chat.WoundOne' : 'NOQUARTER.Chat.WoundMany',
        { roll: natural, count: wounds }
      )})</span>`
    : '';

  const content = `<div class="no-quarter-roll">
    <div class="roll-title"><strong>${foundry.utils.escapeHTML(label)}</strong>${chancesHtml}</div>
    <div class="roll-result degree-${degree}">${result}</div>
    <div class="roll-total">${game.i18n.localize('NOQUARTER.Chat.Roll')}: <strong>${total}</strong>${woundNote}</div>
    ${noteHtml}
    ${damageHtml}
  </div>`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rollMode: game.settings.get('core', 'rollMode'),
  });
  return roll;
}
