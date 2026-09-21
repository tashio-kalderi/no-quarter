/**
 * A wound counter drawn in the bottom right corner of a token. It is hidden
 * while the actor has no wounds.
 */

/**
 * Create or update the wound counter on a token.
 * @param {Token} token
 */
export function refreshWoundBadge(token) {
  if (!token?.document || token.destroyed) return;

  const wounds = token.actor?.usesWounds ? token.actor.system.wounds : 0;
  let badge = token.woundBadge;
  if (badge?.destroyed) badge = token.woundBadge = null;

  if (!wounds) {
    if (badge) badge.visible = false;
    return;
  }

  if (!badge) {
    const Text = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
    badge = new PIXI.Container();
    badge.background = badge.addChild(new PIXI.Graphics());
    badge.label = badge.addChild(new Text('', CONFIG.canvasTextStyle.clone()));
    badge.label.anchor.set(0.5);
    badge.zIndex = 1000;
    // Never intercept clicks meant for the token.
    badge.eventMode = 'none';
    token.woundBadge = token.addChild(badge);
    token.sortableChildren = true;
  }

  // Size the badge relative to the token, and keep it inside the token's
  // bottom right corner.
  const radius = Math.max(10, Math.min(token.w, token.h) * 0.16);
  badge.background
    .clear()
    .lineStyle(2, 0xffffff, 1)
    .beginFill(0x8b0000, 0.95)
    .drawCircle(0, 0, radius)
    .endFill();

  badge.label.text = String(wounds);
  badge.label.style.fontSize = Math.round(radius * 1.3);
  badge.label.style.fill = 0xffffff;
  badge.label.style.stroke = 0x000000;
  badge.label.style.strokeThickness = 3;

  badge.position.set(token.w - radius, token.h - radius);
  badge.visible = true;
}

/**
 * Register the hooks that keep wound counters up to date on the canvas.
 */
export function registerWoundBadge() {
  // Draw and redraw of the token, and every incremental refresh (resizing,
  // moving between scenes and so on).
  Hooks.on('drawToken', (token) => refreshWoundBadge(token));
  Hooks.on('refreshToken', (token) => refreshWoundBadge(token));

  // A change to the actor's wounds does not always refresh its tokens.
  Hooks.on('updateActor', (actor, changed) => {
    if (changed.system && ('wounds' in changed.system || 'usesWounds' in changed.system)) {
      for (const token of actor.getActiveTokens()) refreshWoundBadge(token);
    }
  });
  // Unlinked tokens keep their actor changes in a delta on the token.
  Hooks.on('updateToken', (tokenDocument, changed) => {
    if (changed.delta) refreshWoundBadge(tokenDocument.object);
  });
}
