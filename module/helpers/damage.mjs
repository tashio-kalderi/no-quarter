import { raiseStacks, stackCount } from './conditions.mjs';

/**
 * Applying a hit from its chat card. Every attack that hits shows its damage
 * and the conditions it inflicts in a block that can be dragged onto a token
 * or an actor sheet. Dropping it takes the target's PDR or MDR off the damage,
 * rolls any condition's stacks for that target (so each target of an area
 * attack gets their own duration) and applies the result.
 *
 * A user can only change the actors they own, so a hit dropped on anyone else
 * is passed to the GM's client to apply.
 */

const SCOPE = 'no-quarter';
const SOCKET = `system.${SCOPE}`;
/** The `type` of a hit's drag data. */
const DRAG_TYPE = 'NoQuarterHit';

/** The damage reduction field for each damage type. */
const REDUCTIONS = {
  physical: { field: 'effectivePdr', label: 'PDR' },
  magic: { field: 'effectiveMdr', label: 'MDR' },
};

/**
 * Status effects that are never read out of an ability's effect text, either
 * because they aren't conditions (Dead, the targeting and shield markers) or
 * because the word is too common to mean the condition (Fly).
 */
const NOT_INFLICTED = new Set([
  'dead', 'target', 'eye', 'upgrade', 'downgrade', 'fly', 'hover', 'burrow', 'invisible',
  'regen', 'degen', 'fireShield', 'coldShield', 'magicShield', 'holyShield',
]);

/** A number or a dice formula such as 1d4 or 2d6+1. */
const FORMULA = /^(?:\d+d\d+(?:[+-]\d+)?|\d+)$/i;

/** How many words after a condition its stacks can be written, as in "Poisoned for 1d4 turns". */
const FORMULA_REACH = 3;

/* -------------------------------------------- */
/*  Reading conditions from effect text          */
/* -------------------------------------------- */

/** @returns {object[]} Every status effect. */
export function statusList() {
  return Array.isArray(CONFIG.statusEffects) ? CONFIG.statusEffects : Object.values(CONFIG.statusEffects);
}

/**
 * The forms a word is matched by: itself, and without an -ed or -ing ending,
 * so that "Poisoned" matches Poison and "Stunned" matches Stun.
 * @param {string} word
 * @returns {Set<string>}
 */
function wordForms(word) {
  const lower = word.toLowerCase();
  const forms = new Set([lower]);
  for (const suffix of ['ing', 'ed']) {
    if (!lower.endsWith(suffix) || lower.length < suffix.length + 3) continue;
    const stem = lower.slice(0, -suffix.length);
    forms.add(stem);
    if (stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
  }
  return forms;
}

/**
 * Map every form of every single-word status name (and id) to its status id.
 * @returns {Map<string, string>}
 */
function conditionLookup() {
  const lookup = new Map();
  for (const status of statusList()) {
    if (!status.id || NOT_INFLICTED.has(status.id)) continue;
    for (const name of [status.id, game.i18n.localize(status.name ?? '')]) {
      if (!/^[a-z]+$/i.test(name)) continue;
      for (const form of wordForms(name)) if (!lookup.has(form)) lookup.set(form, status.id);
    }
  }
  return lookup;
}

/**
 * @param {string} id
 * @returns {boolean} Whether a status stacks (see conditions.mjs).
 */
function isStackable(id) {
  return !!statusList().find((s) => s.id === id)?.stackable;
}

/**
 * The conditions a monster ability's effect text inflicts, such as "Poisoned
 * for 1d4 turns" or "2 stacks of Bleeding". A stacking condition takes the
 * number or dice formula written just after it, or one followed by "stacks"
 * just before it, and 1 when there is none. Other conditions are just on.
 * @param {string} text
 * @returns {{id: string, formula: string|null}[]}  `formula` is null for a condition that doesn't stack
 */
export function parseConditions(text) {
  if (!text) return [];
  const lookup = conditionLookup();
  const found = new Map();
  for (const sentence of text.split(/[.;\n]/)) {
    const words = sentence.replace(/\s*([+-])\s*/g, '$1').match(/\d+d\d+(?:[+-]\d+)?|\d+|[a-z]+/gi) ?? [];
    // The condition a following formula belongs to, and where it was named.
    let current = null;
    let currentAt = -1;
    // A formula followed by "stacks", waiting for the condition it's for.
    let pending = null;
    words.forEach((word, i) => {
      if (FORMULA.test(word)) {
        if (current && !current.formula && i - currentAt <= FORMULA_REACH) current.formula = word;
        else if (/^stacks?$/i.test(words[i + 1] ?? '')) pending = word;
        return;
      }
      const id = [...wordForms(word)].map((form) => lookup.get(form)).find(Boolean);
      if (!id) return;
      current = found.get(id) ?? { id, formula: null };
      currentAt = i;
      if (pending && !current.formula) current.formula = pending;
      pending = null;
      found.set(id, current);
    });
  }
  return [...found.values()].map(({ id, formula }) => ({ id, formula: isStackable(id) ? (formula ?? '1') : null }));
}

/**
 * The damage type of a character's basic attack: Melee and Ranged are
 * physical, Magic is magical.
 * @param {string} basicKey
 * @returns {string}  A key of NOQUARTER.damageTypes, or '' for none
 */
export function basicDamageType(basicKey) {
  if (!basicKey) return '';
  return basicKey === 'magic' ? 'magic' : 'physical';
}

/* -------------------------------------------- */
/*  Chat card                                    */
/* -------------------------------------------- */

/**
 * @param {string} id
 * @returns {string} A status effect's name.
 */
function conditionName(id) {
  const status = statusList().find((s) => s.id === id);
  return status ? game.i18n.localize(status.name) : id;
}

/**
 * The line under a hit's damage listing the conditions it inflicts.
 * @param {{id: string, formula: string|null}[]} conditions
 * @returns {string}
 */
export function conditionsHtml(conditions) {
  if (!conditions?.length) return '';
  const list = conditions
    .map(({ id, formula }) => (formula && formula !== '1' ? `${conditionName(id)} (${formula})` : conditionName(id)))
    .join(', ');
  return `<div class="roll-inflicts">${game.i18n.localize('NOQUARTER.Hit.Inflicts')}: ${foundry.utils.escapeHTML(list)}</div>`;
}

/**
 * Make the hits in a rendered roll card draggable. Their data is kept in the
 * message's flags (see rollSuccess), indexed by each block's `data-hit`.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function makeHitsDraggable(message, html) {
  const hits = message.getFlag(SCOPE, 'hits');
  if (!hits) return;
  for (const element of html.querySelectorAll('.roll-hit[data-hit]')) {
    const hit = hits[element.dataset.hit];
    if (!hit) continue;
    element.draggable = true;
    element.dataset.tooltip = game.i18n.localize('NOQUARTER.Hit.DragHint');
    element.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: DRAG_TYPE, ...hit }));
    });
  }
}

/* -------------------------------------------- */
/*  Applying a hit                               */
/* -------------------------------------------- */

/**
 * Ask whether damage with no type of its own is physical or magical.
 * @returns {Promise<string|null>}  Null if the dialog is closed.
 */
function askDamageType() {
  const types = CONFIG.NOQUARTER.damageTypes;
  return foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize('NOQUARTER.Hit.AskType') },
    content: `<p>${game.i18n.localize('NOQUARTER.Hit.AskTypePrompt')}</p>`,
    buttons: Object.entries(types).map(([action, label], i) => ({
      action,
      label: game.i18n.localize(label),
      default: i === 0,
    })),
    rejectClose: false,
  });
}

/**
 * Apply a hit to an actor: its damage less the actor's damage reduction, and
 * its conditions, with their stacks rolled for this actor. The result is posted
 * to chat.
 * @param {Actor} actor
 * @param {{damage: number|null, damageType: string, conditions: {id: string, formula: string|null}[], label: string}} hit
 */
export async function applyHit(actor, hit) {
  if (!actor) return;
  if (!actor.isOwner && !game.users.activeGM) {
    return ui.notifications.warn(game.i18n.format('NOQUARTER.Hit.NoGM', { name: actor.name }));
  }

  // Damage reduction takes off the damage, never below 0.
  let damage = 0;
  const lines = [];
  const esc = foundry.utils.escapeHTML;
  if (hit.damage > 0) {
    const damageType = hit.damageType || (await askDamageType());
    if (!damageType) return;
    const reduction = REDUCTIONS[damageType];
    const dr = Number(actor.system[reduction?.field]) || 0;
    damage = Math.max(0, hit.damage - dr);
    const type = game.i18n.localize(CONFIG.NOQUARTER.damageTypes[damageType]);
    const reduced = dr ? ` (${hit.damage} − ${dr} ${reduction.label})` : '';
    lines.push(`${esc(game.i18n.format('NOQUARTER.Hit.Damage', { damage, type }))}${reduced}`);
  }

  // Each target rolls its own stacks. They don't add to the stacks it already
  // has: the larger number applies (see raiseStacks).
  const rolls = [];
  const stacks = [];
  for (const { id, formula } of hit.conditions ?? []) {
    let count = null;
    const rolled = /d/i.test(formula ?? '');
    if (formula) {
      const roll = await new Roll(formula).evaluate();
      if (rolled) rolls.push(roll);
      count = Math.max(0, roll.total);
      if (!count) continue;
    }
    stacks.push({ id, count });
    const name = conditionName(id);
    const shown = count === null ? name : `${name} ×${count}${rolled ? ` (${formula})` : ''}`;
    const current = count === null ? 0 : stackCount(actor, id);
    const key =
      current >= count ? 'NOQUARTER.Hit.Stays' : current ? 'NOQUARTER.Hit.Raised' : 'NOQUARTER.Hit.Gains';
    lines.push(esc(game.i18n.format(key, { condition: shown, current })));
  }
  if (!lines.length) return;

  const changes = { damage, stacks };
  if (actor.isOwner) await applyChanges(actor, changes);
  else game.socket.emit(SOCKET, { action: 'applyHit', actorUuid: actor.uuid, changes });

  await ChatMessage.create(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="no-quarter-roll no-quarter-hit-result">
        <div class="roll-title"><strong>${esc(actor.name)}</strong> <span class="roll-chances">(${esc(hit.label ?? '')})</span></div>
        ${lines.map((line) => `<div>${line}</div>`).join('')}
      </div>`,
      rolls,
      sound: rolls.length ? CONFIG.sounds.dice : undefined,
    },
    { messageMode: game.settings.get('core', 'messageMode') }
  );
}

/**
 * Change an actor for a hit whose damage and stacks are already worked out.
 * Health is changed directly, so that the wound rules carry any damage beyond
 * 0 over (see NoQuarterActor#_preUpdate).
 * @param {Actor} actor
 * @param {{damage: number, stacks: {id: string, count: number|null}[]}} changes
 */
async function applyChanges(actor, { damage, stacks }) {
  if (damage > 0) await actor.update({ 'system.health.value': actor.system.health.value - damage });
  for (const { id, count } of stacks) {
    if (count === null) await actor.toggleStatusEffect(id, { active: true });
    else await raiseStacks(actor, id, count);
  }
}

/**
 * The token under a point on the canvas, the top one where several overlap.
 * @param {number} x
 * @param {number} y
 * @returns {Token|undefined}
 */
function tokenAt(x, y) {
  return canvas.tokens.placeables
    .filter((t) => t.visible && t.bounds.contains(x, y))
    .sort((a, b) => a.document.elevation - b.document.elevation || a.document.sort - b.document.sort)
    .at(-1);
}

/**
 * Pick the fields of a hit out of dropped data.
 * @param {object} data
 */
function hitFromDrop(data) {
  return {
    damage: Number(data.damage) || 0,
    damageType: data.damageType ?? '',
    conditions: Array.isArray(data.conditions) ? data.conditions : [],
    label: data.label ?? '',
  };
}

/**
 * Register the hooks that make hits draggable and apply them where they are
 * dropped, and the GM's side of applying hits for other users.
 */
export function registerHits() {
  Hooks.on('renderChatMessageHTML', makeHitsDraggable);

  Hooks.on('dropCanvasData', (canvas, data) => {
    if (data.type !== DRAG_TYPE) return;
    const token = tokenAt(data.x, data.y);
    if (token) applyHit(token.actor, hitFromDrop(data));
    else ui.notifications.warn('NOQUARTER.Hit.NoToken', { localize: true });
    return false;
  });

  Hooks.on('dropActorSheetData', (actor, sheet, data) => {
    if (data.type !== DRAG_TYPE) return;
    applyHit(actor, hitFromDrop(data));
    return false;
  });

  Hooks.once('ready', () => {
    game.socket.on(SOCKET, async ({ action, actorUuid, changes } = {}) => {
      if (action !== 'applyHit' || !game.users.activeGM?.isSelf) return;
      const actor = await fromUuid(actorUuid);
      if (actor) await applyChanges(actor, changes);
    });
  });
}
