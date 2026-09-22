import { getTurnState, TURN_STATES } from './turns.mjs';

const GREEN = 0x00cc00;
const YELLOW = 0xffcc00;
const RED = 0xff3333;

/**
 * Color a combatant's movement ruler and grid highlight to show how far they've
 * moved this turn against their Speed: green up to Speed, yellow up to double
 * Speed, red beyond that. Only applies on a combatant's own active turn (see
 * helpers/turns.mjs, which clears the token's movement history when a turn
 * starts so the distance measured here is just this turn's movement).
 */
export function registerMovementRuler() {
  const BaseTokenRuler = CONFIG.Token.rulerClass;

  CONFIG.Token.rulerClass = class NoQuarterTokenRuler extends BaseTokenRuler {
    _getSegmentStyle(waypoint) {
      const style = super._getSegmentStyle(waypoint);
      const color = speedColor(this.token, waypoint);
      if (color !== null) style.color = color;
      return style;
    }

    _getGridHighlightStyle(waypoint, offset) {
      const style = super._getGridHighlightStyle(waypoint, offset);
      const color = speedColor(this.token, waypoint);
      if (color !== null) style.color = color;
      return style;
    }
  };
}

/**
 * @param {Token} token
 * @param {object} waypoint  A ruler waypoint with its measurement already attached.
 * @returns {number|null}  A color to use in place of the default, or null to leave it alone.
 */
function speedColor(token, waypoint) {
  const combatant = token.document.combatant;
  if (!combatant || getTurnState(combatant) !== TURN_STATES.ACTIVE) return null;

  const speed = combatant.actor?.system?.speed;
  if (!Number.isFinite(speed) || speed <= 0) return null;

  const distance = waypoint.measurement?.cost;
  if (!Number.isFinite(distance)) return null;

  if (distance <= speed) return GREEN;
  if (distance <= speed * 2) return YELLOW;
  return RED;
}
