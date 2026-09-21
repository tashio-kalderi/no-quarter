import {
  SIDES,
  TURN_STATES,
  cancelTurn,
  canControl,
  declareSide,
  endTurn,
  getActiveSide,
  getSide,
  getTurnState,
  markDone,
  reopenTurn,
  startTurn,
  startTurnBlocker,
} from '../helpers/turns.mjs';

const TEMPLATES = 'systems/no-quarter/templates/combat';

/**
 * The combat tracker. There is no initiative: combatants are grouped by side
 * and each row shows whether that combatant has gone this cycle.
 */
export class NoQuarterCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {
  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      startTurn: NoQuarterCombatTracker.#onTurnAction,
      endTurn: NoQuarterCombatTracker.#onTurnAction,
      cancelTurn: NoQuarterCombatTracker.#onTurnAction,
      markDone: NoQuarterCombatTracker.#onTurnAction,
      reopenTurn: NoQuarterCombatTracker.#onTurnAction,
      declareSide: NoQuarterCombatTracker.#onTurnAction,
    },
  };

  /** @override */
  static PARTS = {
    header: { template: `${TEMPLATES}/header.hbs` },
    tracker: { template: `${TEMPLATES}/tracker.hbs`, scrollable: [''] },
    footer: { template: `${TEMPLATES}/footer.hbs` },
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareTrackerContext(context, options) {
    const combat = this.viewed;
    context.groups = [];
    if (!combat) return;

    const activeSide = getActiveSide(combat);
    const isGM = game.user.isGM;
    const bySide = { [SIDES.PLAYERS]: [], [SIDES.MONSTERS]: [] };
    for (const [i, combatant] of combat.turns.entries()) {
      if (!combatant.visible) continue;
      bySide[getSide(combatant)].push(await this._prepareTurnContext(combat, combatant, i));
    }

    context.started = combat.started;
    context.isGM = isGM;
    // Between the combat beginning and the GM's declaration nobody is up.
    context.awaitingDeclaration = combat.started && !activeSide;
    context.groups = Object.values(SIDES).map((side) => {
      const turns = bySide[side].sort((a, b) => a.name.localeCompare(b.name));
      const current = side === activeSide;
      return {
        side,
        label: game.i18n.localize(`NOQUARTER.Turn.Side.${side}`),
        turns,
        current,
        // The GM can hand the turn to a side at any point.
        canGive: isGM && combat.started && !current,
      };
    });
    context.banner = activeSide
      ? game.i18n.format('NOQUARTER.Turn.SideUp', {
          side: game.i18n.localize(`NOQUARTER.Turn.Side.${activeSide}`),
        })
      : null;
  }

  /** @override */
  async _prepareTurnContext(combat, combatant, index) {
    const turn = await super._prepareTurnContext(combat, combatant, index);
    const state = getTurnState(combatant);
    const isGM = game.user.isGM;
    // A combatant is up only while they are taking their turn.
    turn.active = state === TURN_STATES.ACTIVE && !turn.isDefeated;
    turn.state = state;
    turn.css = [
      `turn-${state}`,
      turn.active ? 'active' : null,
      turn.hidden ? 'hide' : null,
      turn.isDefeated ? 'defeated' : null,
    ].filterJoin(' ');

    const live = combat.started && !turn.isDefeated;
    const control = live && canControl(combatant);
    const blocker = state === TURN_STATES.READY ? startTurnBlocker(combatant) : null;
    turn.showStart = control && state === TURN_STATES.READY;
    turn.startBlocked = !!blocker;
    turn.startTooltip = blocker ? game.i18n.localize(blocker) : game.i18n.localize('NOQUARTER.Turn.Start');
    turn.showEnd = control && state === TURN_STATES.ACTIVE;
    turn.showDone = live && state === TURN_STATES.DONE;
    turn.showMarkDone = live && isGM && state === TURN_STATES.READY;
    turn.showReopen = live && isGM && state === TURN_STATES.DONE;
    return turn;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * @this {NoQuarterCombatTracker}
   * @param {...any} args
   */
  static #onTurnAction(...args) {
    return this._onTurnAction(...args);
  }

  /**
   * Handle a turn button on a combatant row, or the buttons that declare a side.
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target element.
   * @protected
   */
  async _onTurnAction(event, target) {
    const combat = this.viewed;
    if (!combat) return;
    const { action, side } = target.dataset;
    if (action === 'declareSide') return declareSide(combat, side);

    const { combatantId } = target.closest('[data-combatant-id]')?.dataset ?? {};
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) return;
    switch (action) {
      case 'startTurn':
        return startTurn(combatant);
      case 'endTurn':
        return endTurn(combatant);
      case 'cancelTurn':
        return cancelTurn(combatant);
      case 'markDone':
        return markDone(combatant);
      case 'reopenTurn':
        return reopenTurn(combatant);
    }
  }
}
