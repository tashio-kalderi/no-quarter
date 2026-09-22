import { TURN_STATES } from './turns.mjs';

/**
 * Some status effects stack instead of behaving as a plain on/off toggle.
 * Left-click adds a stack (creating the effect at 1 if it isn't present),
 * right-click removes one (deleting the effect once it reaches 0). What a
 * stack *means* is up to whichever condition uses it - an independent
 * instance (e.g. multiple Bleeds) or a duration counter (e.g. Poisoned) -
 * the mechanism here is identical either way. Every other status effect
 * keeps Foundry's default toggle behavior untouched.
 *
 * Only the built-in "bleeding", "blind" and "poison" statuses are marked
 * stackable so far; the real condition list arrives in a later pass.
 * @type {string[]}
 */
const STACKABLE_STATUS_IDS = ['bleeding', 'blind', 'poison'];

const FLAG_SCOPE = 'no-quarter';
const STACKS_FLAG = 'stacks';

/* -------------------------------------------- */
/*  Stack bookkeeping                            */
/* -------------------------------------------- */

/**
 * Find the ActiveEffect embodying a status on an actor, if any.
 * @param {Actor} actor
 * @param {string} statusId
 * @returns {ActiveEffect|undefined}
 */
function findStatusEffect(actor, statusId) {
  return actor.effects.find((e) => e.statuses.size === 1 && e.statuses.has(statusId));
}

/**
 * The current stack count of a status on an actor.
 * @param {Actor} actor
 * @param {string} statusId
 * @returns {number}  0 when the actor doesn't have the status at all.
 */
export function stackCount(actor, statusId) {
  const effect = findStatusEffect(actor, statusId);
  return effect ? (effect.getFlag(FLAG_SCOPE, STACKS_FLAG) ?? 1) : 0;
}

/**
 * Add one stack of a status to an actor, creating the effect at 1 if it
 * isn't already present.
 * @param {Actor} actor
 * @param {string} statusId
 * @returns {Promise<void>}
 */
export async function addStack(actor, statusId) {
  const existing = findStatusEffect(actor, statusId);
  if (!existing) {
    const ActiveEffectCls = getDocumentClass('ActiveEffect');
    const effect = await ActiveEffectCls.fromStatusEffect(statusId, { parent: actor });
    effect.updateSource({ [`flags.${FLAG_SCOPE}.${STACKS_FLAG}`]: 1 });
    await ActiveEffectCls.create(effect.toObject(), { parent: actor, keepId: true });
    return;
  }
  await existing.setFlag(FLAG_SCOPE, STACKS_FLAG, (existing.getFlag(FLAG_SCOPE, STACKS_FLAG) ?? 1) + 1);
}

/**
 * Remove one stack of a status from an actor, deleting the effect once it
 * reaches 0. Does nothing if the actor doesn't have the status.
 * @param {Actor} actor
 * @param {string} statusId
 * @returns {Promise<void>}
 */
export async function removeStack(actor, statusId) {
  const existing = findStatusEffect(actor, statusId);
  if (!existing) return;
  const stacks = (existing.getFlag(FLAG_SCOPE, STACKS_FLAG) ?? 1) - 1;
  if (stacks <= 0) await existing.delete();
  else await existing.setFlag(FLAG_SCOPE, STACKS_FLAG, stacks);
}

/* -------------------------------------------- */
/*  Token HUD                                    */
/* -------------------------------------------- */

/**
 * A TokenHUD subclass that makes some status effects in the palette
 * stackable. Non-stackable statuses keep core's default toggle behavior
 * (left-click on/off, right-click on+overlay) unchanged.
 */
class NoQuarterTokenHUD extends foundry.applications.hud.TokenHUD {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    actions: {
      // Core's #onToggleEffect is a true-private static method, so it can't
      // be called via super - the non-stackable branch is reimplemented here.
      effect: { handler: NoQuarterTokenHUD.#onClickEffect },
    },
  };

  /**
   * Status ids currently mid-toggle, so a second click on the same icon
   * before the first create/update resolves doesn't create a duplicate
   * effect.
   * @type {Set<string>}
   */
  #pendingStatusIds = new Set();

  /**
   * Handle a click on a status effect icon, routing stackable statuses to
   * their own increment/decrement logic.
   * @this {NoQuarterTokenHUD}
   * @param {PointerEvent} event
   * @param {HTMLImageElement} target
   * @returns {Promise<void>}
   */
  static async #onClickEffect(event, target) {
    if (!this.actor) {
      ui.notifications.warn('HUD.WarningEffectNoActor', { localize: true });
      return;
    }
    const statusId = target.dataset.statusId;
    if (!CONFIG.statusEffects[statusId]?.stackable) {
      await this.actor.toggleStatusEffect(statusId, {
        active: !target.classList.contains('active'),
        overlay: event.button === 2,
      });
      return;
    }
    await this.#onClickStackableEffect(event.button, statusId);
  }

  /**
   * Add or remove one stack of a stackable status effect.
   * @param {number} button    0 for left-click (add), 2 for right-click (remove).
   * @param {string} statusId
   * @returns {Promise<void>}
   */
  async #onClickStackableEffect(button, statusId) {
    if (this.#pendingStatusIds.has(statusId)) return;
    this.#pendingStatusIds.add(statusId);
    try {
      if (button === 2) await removeStack(this.actor, statusId);
      else await addStack(this.actor, statusId);
    } finally {
      this.#pendingStatusIds.delete(statusId);
    }
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const img of this.element.querySelectorAll('.status-effects .effect-control[data-status-id]')) {
      this.#renderStackBadge(img);
    }
  }

  /**
   * Show (or clear) the stack-count badge on a stackable status icon.
   * Idempotent: safe to call on every render.
   * @param {HTMLImageElement} img
   */
  #renderStackBadge(img) {
    const statusId = img.dataset.statusId;
    const wrapper = img.closest('.nq-effect-wrapper');

    const stacks =
      CONFIG.statusEffects[statusId]?.stackable && this.actor ? stackCount(this.actor, statusId) : 0;

    if (!stacks) {
      wrapper?.querySelector('.nq-stack-badge')?.remove();
      return;
    }

    let host = wrapper;
    if (!host) {
      host = document.createElement('span');
      host.className = 'nq-effect-wrapper';
      img.replaceWith(host);
      host.append(img);
    }
    let badge = host.querySelector('.nq-stack-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nq-stack-badge';
      host.append(badge);
    }
    badge.textContent = String(stacks);
  }
}

/**
 * Swap in the stack-aware TokenHUD subclass and mark which statuses stack.
 */
export function registerStackableConditions() {
  CONFIG.Token.hudClass = NoQuarterTokenHUD;
  for (const id of STACKABLE_STATUS_IDS) {
    const status = CONFIG.statusEffects[id];
    if (status) status.stackable = true;
  }
}

/* -------------------------------------------- */
/*  Turn-based condition effects                 */
/* -------------------------------------------- */

/**
 * What a stackable condition does at the start and end of the afflicted
 * combatant's turn. Add an entry here for each condition that needs it; the
 * mechanism in `registerConditionTurnEffects` stays the same for all of them.
 * @type {Object<string, {
 *   onStartTurn?: (actor: Actor, stacks: number) => Promise<void>,
 *   onEndTurn?: (actor: Actor, stacks: number) => Promise<void>,
 * }>}
 */
const CONDITION_TURN_EFFECTS = {
  bleeding: {
    // Deals damage equal to the current stack count at the start of the
    // bleeding character's turn.
    async onStartTurn(actor, stacks) {
      await actor.modifyTokenAttribute('health', -stacks, true, true);
    },
    // Loses one stack at the end of the character's turn.
    async onEndTurn(actor) {
      await removeStack(actor, 'bleeding');
    },
  },
  blind: {
    // A Blind stack is a duration in turns, not a severity - it just counts
    // down, with no start-of-turn effect of its own (see the roll penalty
    // below for what Blind actually does).
    async onEndTurn(actor) {
      await removeStack(actor, 'blind');
    },
  },
  poison: {
    // Likewise, a Poison stack is a duration, not a severity (see the
    // forced-disadvantage effect below for what Poisoned actually does).
    async onEndTurn(actor) {
      await removeStack(actor, 'poison');
    },
  },
};

/* -------------------------------------------- */
/*  Roll penalties                               */
/* -------------------------------------------- */

/**
 * Conditions that penalize a d100 roll's success chances by a flat amount
 * while active. Shown as an opt-out checkbox (checked by default) in the
 * roll-mode dialog, since most rolls are affected - e.g. Blind, because the
 * vast majority of abilities rely on sight. `ignoreCost`, when set, is
 * self-damage taken for unchecking the box instead of just accepting the
 * penalty - e.g. gritting through Burning. Add an entry here for future
 * conditions with the same kind of effect.
 * @type {Object<string, {amount: number, label: string, ignoreCost?: number}>}
 */
const CONDITION_ROLL_PENALTIES = {
  blind: { amount: 10, label: 'NOQUARTER.Condition.Blind' },
  burning: { amount: 25, label: 'NOQUARTER.Condition.Burning', ignoreCost: 1 },
};

/**
 * The roll penalties currently active on an actor, keyed by status id.
 * @param {Actor} [actor]
 * @returns {Object<string, {amount: number, label: string, ignoreCost?: number}>}
 */
export function activeRollPenalties(actor) {
  if (!actor) return {};
  return Object.fromEntries(
    Object.entries(CONDITION_ROLL_PENALTIES).filter(([id]) => stackCount(actor, id) > 0)
  );
}

/**
 * Subtract a flat penalty from a set of success chances. Only the Regular
 * chance is reduced directly (floored at 0); Greater and Extreme are then
 * recalculated as half of the tier before them, the same relationship they
 * have when first unlocked (see `tiers` in success.mjs) - not reduced by the
 * same flat amount themselves. A tier that was already 0 (not unlocked)
 * stays 0 rather than being "unlocked" by the recalculation.
 * @param {{regular: number, greater: number, extreme: number}} chances
 * @param {number} amount
 * @returns {{regular: number, greater: number, extreme: number}}
 */
export function applyRollPenalty(chances, amount) {
  if (!amount) return chances;
  const regular = Math.max(0, chances.regular - amount);
  const greater = chances.greater ? Math.floor(regular / 2) : 0;
  const extreme = chances.extreme ? Math.floor(greater / 2) : 0;
  return { regular, greater, extreme };
}

/**
 * Apply the self-damage cost of ignoring a roll penalty instead of taking
 * it - e.g. gritting through Burning's pain rather than accepting its -25.
 * A no-op when there's nothing to apply.
 * @param {Actor} actor
 * @param {number} cost
 * @returns {Promise<void>}
 */
export async function applyIgnoreCost(actor, cost) {
  if (!cost) return;
  await actor.modifyTokenAttribute('health', -cost, true, true);
}

/**
 * Conditions that force every roll to be made with disadvantage while
 * active, with no opt-out - e.g. Poisoned. Add an entry here for future
 * conditions with the same kind of effect.
 * @type {Object<string, {label: string}>}
 */
const CONDITION_FORCED_DISADVANTAGE = {
  poison: { label: 'NOQUARTER.Condition.Poisoned' },
};

/**
 * The conditions currently forcing disadvantage on an actor's rolls, keyed
 * by status id.
 * @param {Actor} [actor]
 * @returns {Object<string, {label: string}>}
 */
export function activeForcedDisadvantage(actor) {
  if (!actor) return {};
  return Object.fromEntries(
    Object.entries(CONDITION_FORCED_DISADVANTAGE).filter(([id]) => stackCount(actor, id) > 0)
  );
}

const SNAPSHOT_FLAG = 'turnSnapshot';

/**
 * The actor fields start-of-turn effects are allowed to change, and that a
 * canceled (or interrupted) turn restores. Extend this alongside
 * `CONDITION_TURN_EFFECTS` if a future `onStartTurn` touches something else.
 * @param {Actor} actor
 * @returns {{health: number, wounds: number}}
 */
function captureHealthSnapshot(actor) {
  return { health: actor.system.health.value, wounds: actor.system.wounds };
}

/**
 * Restore an actor's health/wounds to a snapshot taken before start-of-turn
 * effects ran. A direct restore rather than a reversal, since undoing a
 * wound cascade (health dropping to 0, converting to a wound, and resetting)
 * isn't just the inverse of the damage that caused it.
 * @param {Actor} actor
 * @param {{health: number, wounds: number}} snapshot
 * @returns {Promise<void>}
 */
async function restoreHealthSnapshot(actor, snapshot) {
  await actor.update({
    'system.health.value': snapshot.health,
    'system.wounds': snapshot.wounds,
  });
}

/**
 * Apply each stackable condition's start/end-of-turn effect as a combatant's
 * turn state changes: "start of turn" is when they click Start turn, "end of
 * turn" is when they click Finish turn. Runs only on the active GM's client
 * so an effect with multiple observers isn't applied more than once.
 *
 * Before any start-of-turn effect runs, the actor's health/wounds are
 * snapshotted on the combatant. If the turn is canceled (or interrupted,
 * e.g. combat moves on before it was finished) instead of finished, that
 * snapshot is restored so effects like Bleeding damage aren't left applied
 * for a turn that didn't happen. Finishing the turn normally just discards
 * the snapshot - by then the turn's effects are meant to stick.
 */
export function registerConditionTurnEffects() {
  Hooks.on('updateCombatant', async (combatant, changed) => {
    if (!game.users.activeGM?.isSelf) return;
    const state = changed.flags?.[FLAG_SCOPE]?.turnState;
    const actor = combatant.actor;
    if (!actor) return;

    if (state === TURN_STATES.ACTIVE) {
      await combatant.setFlag(FLAG_SCOPE, SNAPSHOT_FLAG, captureHealthSnapshot(actor));
      for (const [statusId, effect] of Object.entries(CONDITION_TURN_EFFECTS)) {
        const stacks = stackCount(actor, statusId);
        if (stacks) await effect.onStartTurn?.(actor, stacks);
      }
      return;
    }

    if (state === TURN_STATES.DONE) {
      for (const [statusId, effect] of Object.entries(CONDITION_TURN_EFFECTS)) {
        const stacks = stackCount(actor, statusId);
        if (stacks) await effect.onEndTurn?.(actor, stacks);
      }
      await combatant.unsetFlag(FLAG_SCOPE, SNAPSHOT_FLAG);
      return;
    }

    if (state === TURN_STATES.READY) {
      const snapshot = combatant.getFlag(FLAG_SCOPE, SNAPSHOT_FLAG);
      if (!snapshot) return;
      await restoreHealthSnapshot(actor, snapshot);
      await combatant.unsetFlag(FLAG_SCOPE, SNAPSHOT_FLAG);
    }
  });
}
