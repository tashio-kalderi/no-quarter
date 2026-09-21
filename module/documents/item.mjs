import { rollSuccess } from '../helpers/success.mjs';
import { formatRange } from '../helpers/range.mjs';

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class NoQuarterItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * A range typed as a bare number, such as "60", becomes "60 ft.".
   * @override
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;

    const range = foundry.utils.getProperty(changes, 'system.range');
    if (typeof range === 'string') foundry.utils.setProperty(changes, 'system.range', formatRange(range));
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Abilities roll d100 against their success chances.
    if (item.type === 'ability') {
      // Passive abilities have nothing to roll; post them to chat instead.
      if (!item.system.chances) {
        const esc = foundry.utils.escapeHTML;
        const effect = item.system.effect
          ? `<div class="roll-effect">${esc(item.system.effect)}</div>`
          : '';
        return ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: item.actor }),
          rollMode: game.settings.get('core', 'rollMode'),
          content: `<div class="no-quarter-roll">
            <div class="roll-title"><strong>${esc(item.name)}</strong> <span class="roll-chances">(${game.i18n.localize('NOQUARTER.Passive')})</span></div>
            ${effect}
          </div>`,
        });
      }
      // A monster ability with limited uses can only be rolled that many times
      // per combat.
      const { uses, used } = item.system;
      if (item.actor?.type === 'npc' && uses) {
        if (used >= uses) {
          return ui.notifications.warn(
            game.i18n.format('NOQUARTER.NoUsesLeft', { name: item.name })
          );
        }
        await item.update({ 'system.used': used + 1 });
      }

      // A monster ability shows its damage type and range after the name (the
      // stat block has the chances), and its effect under the roll.
      const isMonster = item.actor?.type === 'npc';
      const typeKey = CONFIG.NOQUARTER.damageTypes[item.system.damageType];
      const tag = isMonster
        ? [typeKey ? game.i18n.localize(typeKey) : '', item.system.range].filter(Boolean).join(', ')
        : undefined;
      const note = isMonster ? item.system.effect : undefined;
      return rollSuccess({
        actor: item.actor,
        note,
        tag,
        label: item.name,
        chances: item.system.chances,
        // Only the basic abilities have a damage value for now.
        damage: item.system.basicKey ? item.system.damage : undefined,
      });
    }

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? '',
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }
}
