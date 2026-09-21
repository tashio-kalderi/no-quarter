/**
 * Side-based turn order. There is no initiative roll and no rounds. When the
 * combat begins the GM declares which side (players or monsters) attacks first,
 * and turns then alternate between the sides. When it is a side's turn, that side picks who
 * goes. A combatant goes once until everyone else on their side has gone, then
 * that side unlocks and can go again.
 *
 * A combatant's own state lives in a flag on the combatant, so its owner (or the
 * GM) can change it. The state of the combat as a whole (which side is up, and
 * unlocking a side) is kept by the GM's client, see `registerTurnReferee`.
 */

const SCOPE = 'no-quarter';

export const SIDES = Object.freeze({ PLAYERS: 'players', MONSTERS: 'monsters' });
export const TURN_STATES = Object.freeze({ READY: 'ready', ACTIVE: 'active', DONE: 'done' });

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/**
 * The side a combatant fights on. Characters are always the players' side, even
 * when no player has claimed them and their token is still hostile. Any other
 * combatant is on the players' side when its token is friendly (an allied
 * monster), and on the monsters' side otherwise (hostile, neutral, secret).
 * @param {Combatant} combatant
 * @returns {string}
 */
export function getSide(combatant) {
  if (combatant.actor?.type === 'character') return SIDES.PLAYERS;
  const friendly = combatant.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  return friendly ? SIDES.PLAYERS : SIDES.MONSTERS;
}

/**
 * @param {Combatant} combatant
 * @returns {string}  One of TURN_STATES. A combatant with no state is ready.
 */
export function getTurnState(combatant) {
  return combatant.getFlag(SCOPE, 'turnState') ?? TURN_STATES.READY;
}

/**
 * The side whose turn it is, or null when the GM has not declared one yet.
 * @param {Combat} combat
 * @returns {string|null}
 */
export function getActiveSide(combat) {
  return combat.getFlag(SCOPE, 'side') ?? null;
}

/**
 * @param {string} side
 * @returns {string}
 */
export function otherSide(side) {
  return side === SIDES.PLAYERS ? SIDES.MONSTERS : SIDES.PLAYERS;
}

/**
 * The combatants on a side that can still take part. Defeated ones are left out,
 * so they never hold up a side unlocking.
 * @param {Combat} combat
 * @param {string} side
 * @returns {Combatant[]}
 */
export function sideMembers(combat, side) {
  return combat.combatants.filter((c) => !c.isDefeated && getSide(c) === side);
}

/**
 * The combatant currently taking their turn, if any.
 * @param {Combat} combat
 * @returns {Combatant|undefined}
 */
export function findActive(combat) {
  return combat.combatants.find((c) => !c.isDefeated && getTurnState(c) === TURN_STATES.ACTIVE);
}

/**
 * Whether the current user may change a combatant's turn. Owners can do it for
 * their own combatants, and the GM for everyone's.
 * @param {Combatant} combatant
 * @returns {boolean}
 */
export function canControl(combatant) {
  return game.user.isGM || combatant.isOwner;
}

/**
 * Why a combatant cannot start their turn right now.
 * @param {Combatant} combatant
 * @returns {string|null}  A language key, or null when they can start.
 */
export function startTurnBlocker(combatant) {
  const combat = combatant.combat;
  if (!combat?.started) return 'NOQUARTER.Turn.Blocked.NotStarted';
  if (combatant.isDefeated) return 'NOQUARTER.Turn.Blocked.Defeated';
  if (getTurnState(combatant) !== TURN_STATES.READY) return 'NOQUARTER.Turn.Blocked.AlreadyGone';
  if (findActive(combat)) return 'NOQUARTER.Turn.Blocked.SomeoneActive';
  const side = getActiveSide(combat);
  if (!side) return 'NOQUARTER.Turn.Blocked.NoSide';
  // The GM can start anyone, to fix mistakes or move things along.
  if (side !== getSide(combatant) && !game.user.isGM) return 'NOQUARTER.Turn.Blocked.NotYourSide';
  return null;
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/**
 * @param {Combatant} combatant
 * @param {string} state
 * @returns {Promise<Combatant>}
 */
function setTurnState(combatant, state) {
  return combatant.setFlag(SCOPE, 'turnState', state);
}

/**
 * Take a turn.
 * @param {Combatant} combatant
 */
export async function startTurn(combatant) {
  if (!canControl(combatant)) return;
  const blocker = startTurnBlocker(combatant);
  if (blocker) return ui.notifications.warn(blocker, { localize: true });
  return setTurnState(combatant, TURN_STATES.ACTIVE);
}

/**
 * Finish a turn.
 * @param {Combatant} combatant
 */
export async function endTurn(combatant) {
  if (!canControl(combatant) || getTurnState(combatant) !== TURN_STATES.ACTIVE) return;
  return setTurnState(combatant, TURN_STATES.DONE);
}

/**
 * Back out of a turn that was started by mistake. The combatant can go later
 * and the turn does not pass to the other side.
 * @param {Combatant} combatant
 */
export async function cancelTurn(combatant) {
  if (!canControl(combatant) || getTurnState(combatant) !== TURN_STATES.ACTIVE) return;
  return setTurnState(combatant, TURN_STATES.READY);
}

/**
 * GM only: mark a combatant as having gone without starting their turn first.
 * @param {Combatant} combatant
 */
export async function markDone(combatant) {
  if (!game.user.isGM || getTurnState(combatant) === TURN_STATES.DONE) return;
  return setTurnState(combatant, TURN_STATES.DONE);
}

/**
 * GM only: let a combatant who has gone take another turn.
 * @param {Combatant} combatant
 */
export async function reopenTurn(combatant) {
  if (!game.user.isGM || getTurnState(combatant) !== TURN_STATES.DONE) return;
  return setTurnState(combatant, TURN_STATES.READY);
}

/**
 * GM only: say which side is up. When the combat begins this is the side that
 * attacks first.
 * @param {Combat} combat
 * @param {string} side
 */
export async function declareSide(combat, side) {
  if (!game.user.isGM || !Object.values(SIDES).includes(side)) return;
  if (!combat.started) return ui.notifications.warn('NOQUARTER.Turn.Blocked.NotStarted', { localize: true });
  if (!sideMembers(combat, side).some((c) => getTurnState(c) === TURN_STATES.READY)) {
    return ui.notifications.warn('NOQUARTER.Turn.Blocked.NobodyReady', { localize: true });
  }
  return combat.setFlag(SCOPE, 'side', side);
}

/* -------------------------------------------- */
/*  Referee                                     */
/* -------------------------------------------- */

/**
 * Unlock any side where everyone has gone, and hand the turn to the other side
 * when a combatant has just finished.
 * @param {Combat} combat
 * @param {string|null} finishedSide  The side of a combatant that just finished their turn.
 */
async function refereeSides(combat, finishedSide = null) {
  if (!combat?.started) return;

  // Each side unlocks on its own, as soon as all of its members have gone.
  const unlocked = new Set();
  const updates = [];
  for (const side of Object.values(SIDES)) {
    const members = sideMembers(combat, side);
    if (!members.length || !members.every((c) => getTurnState(c) === TURN_STATES.DONE)) continue;
    unlocked.add(side);
    for (const c of members) updates.push({ _id: c.id, flags: { [SCOPE]: { turnState: TURN_STATES.READY } } });
  }
  if (updates.length) await combat.updateEmbeddedDocuments('Combatant', updates);

  if (!finishedSide) return;

  // Turns alternate. If the other side has nobody left to go, the same side goes again.
  const hasReady = (side) =>
    unlocked.has(side) || sideMembers(combat, side).some((c) => getTurnState(c) === TURN_STATES.READY);
  const other = otherSide(finishedSide);
  const next = hasReady(other) ? other : hasReady(finishedSide) ? finishedSide : null;
  if (next && next !== getActiveSide(combat)) await combat.setFlag(SCOPE, 'side', next);
}

/**
 * Start the combat with nobody having gone and no side declared.
 * @param {Combat} combat
 */
async function resetTurns(combat) {
  const updates = combat.combatants
    .filter((c) => getTurnState(c) !== TURN_STATES.READY)
    .map((c) => ({ _id: c.id, flags: { [SCOPE]: { turnState: TURN_STATES.READY } } }));
  if (updates.length) await combat.updateEmbeddedDocuments('Combatant', updates);
  if (getActiveSide(combat)) await combat.unsetFlag(SCOPE, 'side');
}

/**
 * Register the hooks that keep the turn order going. Players cannot edit the
 * combat itself, so this only acts on the GM's client.
 */
export function registerTurnReferee() {
  const isReferee = () => game.users.activeGM?.isSelf;

  Hooks.on('updateCombatant', (combatant, changed) => {
    if (!isReferee()) return;
    const finished = changed.flags?.[SCOPE]?.turnState === TURN_STATES.DONE;
    refereeSides(combatant.combat, finished ? getSide(combatant) : null);
  });

  // Removing the last combatant who had not gone can unlock their side.
  Hooks.on('deleteCombatant', (combatant) => {
    if (isReferee()) refereeSides(combatant.parent);
  });

  // Being defeated through the actor's status does not touch the combatant.
  const onDefeatedStatus = (effect) => {
    if (!isReferee() || !effect.statuses?.has(CONFIG.specialStatusEffects.DEFEATED)) return;
    const actor = effect.parent;
    for (const combat of game.combats) {
      if (combat.combatants.some((c) => c.actorId === actor?.id)) refereeSides(combat);
    }
  };
  Hooks.on('createActiveEffect', onDefeatedStatus);
  Hooks.on('deleteActiveEffect', onDefeatedStatus);

  // Beginning the combat means everyone is ready and the GM declares the attacking side.
  Hooks.on('updateCombat', (combat, changed) => {
    if (isReferee() && 'round' in changed) resetTurns(combat);
  });
}

/**
 * Register the hooks every client needs: turns are not taken in a fixed order,
 * so no one is "up" according to the core turn pointer.
 */
export function registerTurnOrder() {
  Hooks.on('combatStart', (combat, updateData) => {
    updateData.turn = null;
  });
  Hooks.on('combatRound', (combat, updateData) => {
    updateData.turn = null;
  });
}
