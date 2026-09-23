import { NOQUARTER } from './config.mjs';
import { activeRollPenalties, activeForcedAdvantage, activeForcedDisadvantage } from './conditions.mjs';

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
 * The text shown in brackets after a name: the success chances, unless a tag
 * (such as a monster ability's damage type and range) replaces them.
 * @param {{regular: number, greater: number, extreme: number}} chances
 * @param {string} [tag]
 * @returns {string}   Empty when there is nothing to show
 */
function bracketText(chances, tag) {
  if (tag === undefined) return `(${chances.regular}/${chances.greater}/${chances.extreme})`;
  return tag ? `(${tag})` : '';
}

/**
 * Ask how a roll is made: normally, with advantage, or with disadvantage.
 * When the actor has an active condition that penalizes rolls (such as
 * Blind or Burning), also asks whether that penalty applies to this
 * particular roll, as a checkbox above the mode buttons, checked by default -
 * most rolls are affected, but a roll that doesn't rely on sight can opt out.
 * Some penalties (such as Burning) cost self-damage to opt out of instead of
 * being free to decline; that's noted next to the checkbox. When the actor
 * has a condition that forces disadvantage (such as Poisoned), Normal and
 * Advantage are disabled instead - there is no opting out of that one. A
 * condition that forces advantage (such as Blessed) likewise leaves only
 * Advantage, and when both are active they cancel out, leaving only Normal.
 * Meant to grow into the place where optional abilities (such as ones that
 * cost stamina) are chosen.
 * @param {object} options
 * @param {string} options.label    The name of the stat or ability being rolled
 * @param {{regular: number, greater: number, extreme: number}} options.chances
 * @param {string} [options.tag]    Shown instead of the chances, see rollSuccess
 * @param {Actor} [options.actor]   The actor the roll is made for, to check for penalizing conditions
 * @returns {Promise<{mode: 'normal'|'advantage'|'disadvantage', penalty: number, cost: number, consumed: string[]}|null>}
 *   Null if the dialog is closed. Pass the result to `applyRollCosts` once the roll goes ahead.
 */
export async function askRollMode({ label, chances, tag, actor }) {
  const esc = foundry.utils.escapeHTML;
  const bracket = bracketText(chances, tag);
  const penalties = activeRollPenalties(actor);
  const penaltyRows = Object.entries(penalties)
    .map(([id, penalty]) => {
      const hint = penalty.ignoreCost
        ? ` <span class="no-quarter-roll-penalty-hint">${esc(
            game.i18n.format('NOQUARTER.RollMode.IgnoreCost', { cost: penalty.ignoreCost })
          )}</span>`
        : '';
      return `<label class="no-quarter-roll-penalty">
        <input type="checkbox" name="penalty-${id}" checked>
        ${esc(game.i18n.localize(penalty.label))}${hint}
      </label>`;
    })
    .join('');

  // Forced advantage (Blessed) and forced disadvantage (Poisoned) cancel out,
  // leaving Normal as the only choice.
  const forcedDis = activeForcedDisadvantage(actor);
  const forcedAdv = activeForcedAdvantage(actor);
  const labels = (conditions) => Object.values(conditions).map((c) => game.i18n.localize(c.label));
  const disLabels = labels(forcedDis);
  const advLabels = labels(forcedAdv);
  let forcedMode = null;
  let forcedRows = [];
  if (disLabels.length && advLabels.length) {
    forcedMode = 'normal';
    forcedRows = [game.i18n.format('NOQUARTER.RollMode.Cancelled', {
      advantage: advLabels.join(', '),
      disadvantage: disLabels.join(', '),
    })];
  } else if (disLabels.length) {
    forcedMode = 'disadvantage';
    forcedRows = disLabels.map((condition) => game.i18n.format('NOQUARTER.RollMode.Forced', { condition }));
  } else if (advLabels.length) {
    forcedMode = 'advantage';
    forcedRows = advLabels.map((condition) => game.i18n.format('NOQUARTER.RollMode.ForcedAdvantage', { condition }));
  }
  const forcedHtml = forcedRows.map((text) => `<p class="no-quarter-roll-forced">${esc(text)}</p>`).join('');
  // Each forced-advantage condition loses a stack for being applied, even when cancelled out.
  const consumed = Object.keys(forcedAdv);

  const button = (action, isDefault = false) => ({
    action,
    label: game.i18n.localize(NOQUARTER.rollModes[action]),
    default: forcedMode ? action === forcedMode : isDefault,
    disabled: !!forcedMode && action !== forcedMode,
    callback: (event, target, dialog) => {
      let penalty = 0;
      let cost = 0;
      for (const [id, entry] of Object.entries(penalties)) {
        const checked = dialog.element.querySelector(`[name="penalty-${id}"]`)?.checked;
        if (checked) penalty += entry.amount;
        else if (entry.ignoreCost) cost += entry.ignoreCost;
      }
      return { mode: action, penalty, cost, consumed };
    },
  });

  return foundry.applications.api.DialogV2.wait({
    window: { title: label },
    content: `<p class="no-quarter-roll-prompt"><strong>${esc(label)}</strong>${bracket ? ` ${esc(bracket)}` : ''}</p>
      ${forcedHtml}
      ${penaltyRows}
      <p>${game.i18n.localize('NOQUARTER.RollMode.Prompt')}</p>`,
    buttons: [button('normal', true), button('advantage'), button('disadvantage')],
    rejectClose: false,
  });
}

/**
 * Roll d100 against a set of success chances and post the result to chat.
 * The message shows the name and chances, the degree of success, the die roll
 * and, when a base damage is given, the damage dealt.
 *
 * With advantage the d100 is rolled twice and the lower result is used (lower
 * is better); with disadvantage it is rolled twice and the higher is used.
 * Wounds apply to both rolls before they are compared.
 * @param {object} options
 * @param {Actor} [options.actor]   The actor the roll is made for
 * @param {string} options.label    The name of the stat or ability rolled
 * @param {{regular: number, greater: number, extreme: number}} options.chances
 * @param {number} [options.damage]   Base damage; the degree of success adds to it
 * @param {string} [options.note]   Plain text shown under the roll, such as a monster ability's range and damage
 * @param {string} [options.tag]   Text shown in brackets after the name instead of the success chances, such as a monster ability's damage type and range
 * @param {'normal'|'advantage'|'disadvantage'} [options.mode='normal']
 * @returns {Promise<Roll>}
 */
export async function rollSuccess({ actor, label, chances, damage, note, tag, mode = 'normal' }) {
  const roll = await new Roll(mode === 'normal' ? '1d100' : '2d100').evaluate();
  const wounds = actor?.usesWounds ? actor.system.wounds : 0;

  // Both natural results, in the order they were rolled.
  const naturals = roll.dice[0].results.map((r) => r.result);

  // Apply the wounds to every roll, then keep the best (advantage) or worst
  // (disadvantage) one. Ties are broken by the natural roll, so a natural 1
  // or 100 is never passed over.
  const rolls = naturals
    .map((natural) => ({ natural, total: woundedRoll(natural, wounds) }))
    .sort((a, b) => a.total - b.total || a.natural - b.natural);
  const { natural, total } = mode === 'disadvantage' ? rolls.at(-1) : rolls[0];

  const degree = successDegree(natural, chances, wounds);
  const result = game.i18n.localize(NOQUARTER.successDegrees[degree]);

  const bonus = NOQUARTER.damageBonus[degree];
  let damageHtml = '';
  if (damage !== undefined && bonus !== undefined) {
    const breakdown = bonus ? ` (${damage} + ${bonus})` : '';
    damageHtml = `<div class="roll-damage">${game.i18n.localize('NOQUARTER.Chat.Damage')}: <strong>${damage + bonus}</strong>${breakdown}</div>`;
  }

  const noteHtml = note ? `<div class="roll-effect">${foundry.utils.escapeHTML(note)}</div>` : '';

  const bracket = bracketText(chances, tag);
  const chancesHtml = bracket ? ` <span class="roll-chances">${foundry.utils.escapeHTML(bracket)}</span>` : '';

  const woundNote = wounds
    ? ` <span class="roll-wounds">(${game.i18n.format(
        wounds === 1 ? 'NOQUARTER.Chat.WoundOne' : 'NOQUARTER.Chat.WoundMany',
        { roll: natural, count: wounds }
      )})</span>`
    : '';

  const modeHtml =
    mode === 'normal'
      ? ''
      : `<div class="roll-mode">${game.i18n.localize(NOQUARTER.rollModes[mode])}: ${naturals.join(', ')}</div>`;

  const content = `<div class="no-quarter-roll">
    <div class="roll-title"><strong>${foundry.utils.escapeHTML(label)}</strong>${chancesHtml}</div>
    <div class="roll-result degree-${degree}">${result}</div>
    <div class="roll-total">${game.i18n.localize('NOQUARTER.Chat.Roll')}: <strong>${total}</strong>${woundNote}</div>
    ${modeHtml}
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
