import { askRollMode, attackRolls, rollSuccess } from './success.mjs';
import { applyRollPenalty, applyRollCosts } from './conditions.mjs';
import { basicDamageType } from './damage.mjs';
import { TURN_STATES, getTurnState } from './turns.mjs';

/**
 * The attack box: clicking a character's basic attack first opens a box
 * listing the supplemental abilities that work with it, then the usual roll
 * box (normal / advantage / disadvantage and the conditions' modifiers).
 *
 * - A supplemental ability with a stamina cost, a Special one, or one with an
 *   attack limit (see NOQUARTER.attackLimits) has a checkbox. Only one Special
 *   can be checked. Any other (free and unlimited, such as Bludgeon) always
 *   applies and is just listed.
 * - Extra attacks (Strike Speed) open the box again for each attack. What was
 *   picked on the first attack carries over and its stamina is only paid
 *   once; only limited abilities (Feint, Impose Condition: Restrained) are
 *   picked again, while they have uses left.
 * - Stamina is paid when the attack is rolled, not when the box is confirmed,
 *   so backing out of the roll box costs nothing.
 * - During the character's own turn in combat, the box remembers where it was
 *   (what's checked, which attack is next) until the turn ends, so closing it
 *   by accident and clicking the attack again picks up where it left off.
 *   Out of combat, closing it simply drops the attack.
 */

const SCOPE = 'no-quarter';

/**
 * What the attack box remembers for each combatant taking their turn, by the
 * combatant's uuid: the uses of "perTurn" abilities this turn, and the attack
 * in progress for each basic attack, by item id. Cleared whenever the
 * combatant's turn state changes. Only kept on this client.
 * @type {Map<string, {uses: Object<string, number>, attacks: Object<string, object>}>}
 */
const turnMemory = new Map();

/**
 * The attack boxes open on this client, by the basic attack's uuid, so a
 * second click brings the open one forward instead of starting over.
 * @type {Map<string, foundry.applications.api.DialogV2|null>}
 */
const running = new Map();

/**
 * An attack that hasn't been made yet.
 * @returns {{index: number, total: number, carried: Set<string>, paid: Set<string>, landed: Set<string>, draft: string[]|null, uses: Object<string, number>}}
 *   `index` is how many attacks were made, `carried` the unlimited abilities picked on the first one,
 *   `paid` the abilities whose stamina was paid, `landed` the "oneHit" abilities that hit, `draft` what
 *   was checked in the box last shown, and `uses` the "perTurn" uses when there's no turn to count them.
 */
function newAttack() {
  return { index: 0, total: 1, carried: new Set(), paid: new Set(), landed: new Set(), draft: null, uses: {} };
}

/**
 * The combatant for an actor in a started combat, preferring the one taking
 * their turn. A linked character's sheet matches its combatant whichever way
 * it was opened (from the sidebar or the token). The attack box is remembered
 * for this combatant until their turn state next changes, so an attack made
 * before Start turn is clicked, or out of turn (Counterattack), is kept too.
 * @param {Actor} actor
 * @returns {Combatant|null}
 */
function combatantFor(actor) {
  const matches = (c) =>
    c.actor === actor ||
    c.actor?.uuid === actor.uuid ||
    (!actor.isToken && c.actorId === actor.id && (c.token?.actorLink ?? true));
  const found = game.combats
    .filter((combat) => combat.started)
    .flatMap((combat) => combat.combatants.filter(matches));
  return found.find((c) => getTurnState(c) === TURN_STATES.ACTIVE) ?? found[0] ?? null;
}

/**
 * The supplemental abilities a character can add onto one of their basic
 * attacks: the ones tied to it that they have at rank 1 or more.
 * @param {Item} item   The basic attack
 * @returns {Item[]}
 */
function supplementals(item) {
  const key = item.system.basicKey;
  return item.actor.items
    .filter(
      (i) =>
        i.type === 'ability' &&
        i.system.actionType === 'supplemental' &&
        i.system.effectiveRank >= 1 &&
        i.system.basicAttacks.has(key)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {Item} ability @returns {number} */
const staminaCost = (ability) => ability.system.staminaCost ?? 0;

/**
 * Whether an ability always applies, with no checkbox: free, unlimited and not Special.
 * @param {Item} ability
 */
const alwaysApplies = (ability) => !ability.system.isSpecial && !staminaCost(ability) && !ability.system.attackLimit;

/**
 * How many more attacks a limited ability can be added onto.
 * @param {Item} ability
 * @param {object} attack   See newAttack
 * @param {Object<string, number>} uses   Uses of "perTurn" abilities so far
 * @returns {{left: number, max: number}}   Infinity when unlimited
 */
function usesLeft(ability, attack, uses) {
  switch (ability.system.attackLimit) {
    case 'perTurn': {
      const max = ability.system.usesPerTurn;
      return { left: Math.max(0, max - (uses[ability.id] ?? 0)), max };
    }
    case 'oneHit':
      return { left: attack.landed.has(ability.id) ? 0 : 1, max: 1 };
    default:
      return { left: Infinity, max: Infinity };
  }
}

/**
 * Make a character's basic attack through the attack box, once per attack.
 * @param {Item} item   The basic attack
 */
export async function attackWithBox(item) {
  const actor = item.actor;
  // Already attacking: bring the attack box forward, unless the roll box is showing instead.
  if (running.has(item.uuid)) {
    const open = running.get(item.uuid);
    if (open?.rendered) open.bringToFront();
    return;
  }
  running.set(item.uuid, null);
  try {
    // In combat the attack is remembered until the turn state changes; otherwise it's dropped when the box closes.
    const combatant = combatantFor(actor);
    let memory = null;
    if (combatant) {
      if (!turnMemory.has(combatant.uuid)) turnMemory.set(combatant.uuid, { uses: {}, attacks: {} });
      memory = turnMemory.get(combatant.uuid);
    }
    const attack = memory?.attacks[item.id] ?? newAttack();
    if (memory) memory.attacks[item.id] = attack;
    const uses = memory?.uses ?? attack.uses;
    const forget = () => {
      if (memory?.attacks[item.id] === attack) delete memory.attacks[item.id];
    };

    while (attack.index < attack.total) {
      const choice = await askAttackOptions(item, attack, uses);
      if (!choice) return;
      if (choice === 'cancel') {
        if (await confirmGiveUp(attack)) return forget();
        continue;
      }
      const made = await makeAttack(item, attack, uses, choice);
      if (!made) return;
    }
    forget();
  } finally {
    running.delete(item.uuid);
  }
}

/**
 * Ask whether to give up the rest of an attack. Nothing has been paid before
 * the first attack, so that one is given up without asking.
 * @param {object} attack   See newAttack
 * @returns {Promise<boolean>}
 */
async function confirmGiveUp(attack) {
  if (!attack.index) return true;
  return foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize('NOQUARTER.AttackBox.GiveUpTitle') },
    content: `<p>${game.i18n.format('NOQUARTER.AttackBox.GiveUp', { count: attack.total - attack.index })}</p>`,
    rejectClose: false,
  });
}

/**
 * Show the attack box for the next attack.
 * @param {Item} item   The basic attack
 * @param {object} attack   See newAttack
 * @param {Object<string, number>} uses
 * @returns {Promise<string[]|'cancel'|null>}   The ids of the abilities checked, 'cancel', or null if it was closed
 */
async function askAttackOptions(item, attack, uses) {
  const actor = item.actor;
  const esc = foundry.utils.escapeHTML;
  const first = attack.index === 0;
  const all = supplementals(item);
  const always = all.filter(alwaysApplies);
  // On later attacks, what was picked on the first carries over; only limited abilities are picked again.
  const carried = first ? [] : all.filter((a) => attack.carried.has(a.id));
  const choices = all.filter((a) => !alwaysApplies(a) && (first || (a.system.attackLimit && !attack.carried.has(a.id))));
  const carriedSpecial = carried.some((a) => a.system.isSpecial);
  const checked = new Set(attack.draft ?? []);
  const stamina = actor.system.stamina?.value ?? 0;

  const optionRows = choices.map((ability) => {
    const { left, max } = usesLeft(ability, attack, uses);
    const disabled = left <= 0 || (carriedSpecial && ability.system.isSpecial);
    const cost = attack.paid.has(ability.id) ? 0 : staminaCost(ability);
    const tags = [];
    if (ability.system.isSpecial) tags.push(`<span class="nq-attack-tag">${game.i18n.localize('NOQUARTER.ActionType.special.label')}</span>`);
    if (ability.system.scaledLabel) tags.push(`<span class="nq-attack-value">${esc(ability.system.scaledLabel)}</span>`);
    if (staminaCost(ability)) {
      const text = cost
        ? game.i18n.format('NOQUARTER.AttackBox.Cost', { cost })
        : game.i18n.localize('NOQUARTER.AttackBox.Paid');
      tags.push(`<span class="nq-attack-cost">${esc(text)}</span>`);
    }
    if (max !== Infinity) {
      const text =
        ability.system.attackLimit === 'oneHit' && !left
          ? game.i18n.localize('NOQUARTER.AttackBox.Landed')
          : game.i18n.format('NOQUARTER.AttackBox.UsesLeft', { left, max });
      tags.push(`<span class="nq-attack-uses">${esc(text)}</span>`);
    }
    return `<label class="nq-attack-option${disabled ? ' disabled' : ''}" data-tooltip="${esc(ability.system.effectNote)}">
      <input type="checkbox" name="option" value="${ability.id}" data-cost="${cost}"
        ${ability.system.isSpecial ? 'data-special' : ''} ${checked.has(ability.id) && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="nq-attack-name">${esc(ability.name)}</span>${tags.join('')}
    </label>`;
  });

  const listed = (key, abilities) => {
    if (!abilities.length) return '';
    const names = abilities.map((a) => {
      const value = a.system.scaledLabel ? ` (${a.system.scaledLabel})` : '';
      return `<span data-tooltip="${esc(a.system.effectNote)}">${esc(a.name + value)}</span>`;
    });
    return `<p class="nq-attack-listed"><strong>${game.i18n.localize(key)}:</strong> ${names.join(', ')}</p>`;
  };

  const chances = item.system.chances;
  const bracket = chances ? ` (${chances.regular}/${chances.greater}/${chances.extreme})` : '';
  const counter =
    attack.total > 1 || !first
      ? ` <span class="nq-attack-counter">${esc(game.i18n.format('NOQUARTER.AttackBox.AttackOf', { number: attack.index + 1, total: attack.total }))}</span>`
      : '';
  const empty = !optionRows.length && !always.length && !carried.length;

  const content = `<div class="nq-attack-box">
    <p class="nq-attack-title"><strong>${esc(item.name)}</strong>${esc(bracket)}${counter}</p>
    ${optionRows.length ? `<div class="nq-attack-options">${optionRows.join('')}</div>` : ''}
    ${listed('NOQUARTER.AttackBox.Always', always)}
    ${listed('NOQUARTER.AttackBox.Carried', carried)}
    ${empty ? `<p class="nq-attack-none">${game.i18n.localize('NOQUARTER.AttackBox.None')}</p>` : ''}
    ${optionRows.length ? `<p class="nq-attack-stamina"></p>` : ''}
  </div>`;

  /**
   * Keep only one Special checked, show the stamina the checked abilities
   * cost, stop the attack when there isn't enough, and remember what's checked.
   * @param {HTMLElement} element
   * @param {HTMLInputElement} [changed]
   */
  const refresh = (element, changed) => {
    const boxes = [...element.querySelectorAll('input[name="option"]')];
    if (changed?.checked && changed.hasAttribute('data-special')) {
      for (const box of boxes) if (box !== changed && box.hasAttribute('data-special')) box.checked = false;
    }
    const on = boxes.filter((box) => box.checked);
    attack.draft = on.map((box) => box.value);
    const cost = on.reduce((sum, box) => sum + Number(box.dataset.cost), 0);
    const line = element.querySelector('.nq-attack-stamina');
    if (line) {
      line.textContent = game.i18n.format('NOQUARTER.AttackBox.StaminaLine', { cost, stamina });
      line.classList.toggle('over', cost > stamina);
    }
    const button = element.querySelector('button[data-action="attack"]');
    if (button) button.disabled = cost > stamina;
  };

  return foundry.applications.api.DialogV2.wait({
    window: { title: item.name, icon: 'fa-solid fa-hand-fist' },
    classes: ['no-quarter-attack-box'],
    content,
    buttons: [
      {
        action: 'attack',
        label: game.i18n.localize('NOQUARTER.AttackBox.Attack'),
        icon: 'fa-solid fa-dice-d20',
        default: true,
        callback: (event, button, dialog) =>
          [...dialog.element.querySelectorAll('input[name="option"]:checked')].map((box) => box.value),
      },
      { action: 'cancel', label: game.i18n.localize('NOQUARTER.AttackBox.Cancel'), icon: 'fa-solid fa-xmark', callback: () => 'cancel' },
    ],
    render: (event, dialog) => {
      running.set(item.uuid, dialog);
      const element = dialog.element;
      element.querySelector('.nq-attack-options')?.addEventListener('change', (e) => refresh(element, e.target));
      refresh(element);
    },
    rejectClose: false,
  });
}

/**
 * Ask how the attack is rolled, pay for it and roll it.
 * @param {Item} item   The basic attack
 * @param {object} attack   See newAttack
 * @param {Object<string, number>} uses
 * @param {string[]} ids   The abilities checked in the attack box
 * @returns {Promise<boolean>}   False if it was called off before rolling
 */
async function makeAttack(item, attack, uses, ids) {
  const actor = item.actor;
  const first = attack.index === 0;
  const all = supplementals(item);
  const picked = ids.map((id) => all.find((a) => a.id === id)).filter(Boolean);
  const carried = first ? [] : all.filter((a) => attack.carried.has(a.id));
  const active = [...all.filter(alwaysApplies), ...carried, ...picked];

  // Abilities such as Feint give the roll advantage, like a boon.
  const grants = active.filter((a) => a.system.automation === 'advantage').map((a) => a.name);
  const chances = item.system.chances;
  const asked = await askRollMode({ label: item.name, chances, actor, ability: true, grants });
  if (!asked) return false;

  // The attack goes ahead: pay the stamina not yet paid for.
  const unpaid = picked.filter((a) => !attack.paid.has(a.id) && staminaCost(a));
  const cost = unpaid.reduce((sum, a) => sum + staminaCost(a), 0);
  const stamina = actor.system.stamina?.value ?? 0;
  if (cost > stamina) {
    ui.notifications.warn(game.i18n.format('NOQUARTER.AttackBox.NotEnough', { name: actor.name, cost, stamina }));
    return false;
  }
  if (cost) await actor.update({ 'system.stamina.value': stamina - cost });
  for (const ability of picked) {
    attack.paid.add(ability.id);
    if (ability.system.attackLimit === 'perTurn') uses[ability.id] = (uses[ability.id] ?? 0) + 1;
  }
  // The first attack sets what carries over and how many attacks there are.
  if (first) {
    for (const ability of picked) if (!ability.system.attackLimit) attack.carried.add(ability.id);
    const extra = active
      .filter((a) => a.system.automation === 'extraAttacks')
      .reduce((sum, a) => sum + (a.system.scaledValue ?? 0), 0);
    attack.total = 1 + Math.max(0, extra);
  }

  const rolls = attackRolls(actor, asked, 1);
  await applyRollCosts(actor, rolls);

  const ignore = active.filter((a) => a.system.automation === 'ignoreDr' && a.system.scaledValue);
  const { hits } = await rollSuccess({
    actor,
    label: item.name,
    chances: applyRollPenalty(chances, asked.penalty),
    modes: rolls.modes,
    damage: item.system.totalDamage,
    damageType: basicDamageType(item.system.basicKey),
    conditions: mergeConditions(active.flatMap((a) => a.system.attackConditions)),
    ignoreDr: {
      value: ignore.reduce((sum, a) => sum + a.system.scaledValue, 0),
      sources: ignore.map((a) => a.name),
    },
    note: item.system.effectNote || undefined,
    details: attackDetails(attack, active, unpaid),
  });

  // An ability that only lands once (Restrained) is used up by a hit.
  if (hits[0]) for (const ability of picked) if (ability.system.attackLimit === 'oneHit') attack.landed.add(ability.id);
  attack.index += 1;
  attack.draft = null;
  return true;
}

/**
 * Put together the conditions from several abilities, adding up the stacks
 * of the same condition (Lacerate and Impose Condition (Bleeding) together).
 * @param {{id: string, formula: string|null}[]} conditions
 * @returns {{id: string, formula: string|null}[]}
 */
function mergeConditions(conditions) {
  const merged = new Map();
  for (const { id, formula } of conditions) {
    const existing = merged.get(id);
    if (!existing) merged.set(id, { id, formula });
    else if (existing.formula !== null && formula !== null) existing.formula = String(Number(existing.formula) + Number(formula));
  }
  return [...merged.values()];
}

/**
 * The lines on the chat card under the attack's name: which attack it is, the
 * abilities added onto it (with the stamina paid this attack), and the effect
 * of any of them the system doesn't apply by itself, for the GM to apply.
 * @param {object} attack   See newAttack; `index` is still this attack's
 * @param {Item[]} active   The abilities on this attack
 * @param {Item[]} unpaid   The abilities paid for on this attack
 * @returns {string[]}
 */
function attackDetails(attack, active, unpaid) {
  const lines = [];
  if (attack.total > 1) {
    lines.push(game.i18n.format('NOQUARTER.AttackBox.AttackOf', { number: attack.index + 1, total: attack.total }));
  }
  if (active.length) {
    const names = active.map((a) =>
      unpaid.includes(a) ? game.i18n.format('NOQUARTER.AttackBox.PaidNote', { name: a.name, cost: staminaCost(a) }) : a.name
    );
    lines.push(game.i18n.format('NOQUARTER.AttackBox.With', { abilities: names.join(', ') }));
  }
  for (const ability of active) {
    if (!ability.system.automation && ability.system.effectNote) lines.push(`${ability.name}: ${ability.system.effectNote}`);
  }
  return lines;
}

/**
 * Forget a combatant's attack boxes whenever their turn state changes, so
 * they last for one turn, and when they leave the combat.
 */
export function registerAttackBox() {
  Hooks.on('updateCombatant', (combatant, changed) => {
    if (changed.flags?.[SCOPE] && 'turnState' in changed.flags[SCOPE]) turnMemory.delete(combatant.uuid);
  });
  Hooks.on('deleteCombatant', (combatant) => turnMemory.delete(combatant.uuid));
  Hooks.on('deleteCombat', (combat) => {
    for (const combatant of combat.combatants) turnMemory.delete(combatant.uuid);
  });
}
