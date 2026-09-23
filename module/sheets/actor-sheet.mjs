import {
  effectActions,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { formatRange } from '../helpers/range.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = 'systems/no-quarter/templates/actor';

/**
 * The actor sheet for characters and monsters (npc).
 * @extends {ActorSheetV2}
 */
export class NoQuarterActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    // The sheet CSS is written for a light background, so don't follow the
    // user's dark interface theme.
    classes: ['no-quarter', 'actor', 'themed', 'theme-light'],
    position: { width: 660, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      createItem: NoQuarterActorSheet.#onCreateItem,
      editItem: NoQuarterActorSheet.#onEditItem,
      deleteItem: NoQuarterActorSheet.#onDeleteItem,
      roll: NoQuarterActorSheet.#onRoll,
      resetUses: NoQuarterActorSheet.#onResetUses,
      ...effectActions,
    },
  };

  /**
   * The header and abilities tab are swapped for the actor's type in
   * _configureRenderParts.
   * @override
   */
  static PARTS = {
    header: { template: `${TEMPLATES}/header-character.hbs` },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    abilities: { template: `${TEMPLATES}/tab-abilities-character.hbs`, scrollable: [''] },
    description: { template: `${TEMPLATES}/tab-description.hbs` },
    items: { template: `${TEMPLATES}/tab-items.hbs`, scrollable: [''] },
    spells: { template: `${TEMPLATES}/tab-spells.hbs`, scrollable: [''] },
    effects: { template: 'systems/no-quarter/templates/shared/tab-effects.hbs', scrollable: [''] },
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: 'abilities' },
        { id: 'description' },
        { id: 'items' },
        { id: 'spells' },
        { id: 'effects' },
      ],
      initial: 'abilities',
      labelPrefix: 'NOQUARTER.Tabs',
    },
  };

  /* -------------------------------------------- */

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const type = this.actor.type;
    parts.header.template = `${TEMPLATES}/header-${type}.hbs`;
    parts.abilities.template = `${TEMPLATES}/tab-abilities-${type}.hbs`;
    // Monsters don't cast spells.
    if (type === 'npc') delete parts.spells;
    return parts;
  }

  /** @override */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== 'primary' || this.actor.type !== 'npc') return config;
    return { ...config, tabs: config.tabs.filter((t) => t.id !== 'spells') };
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;

    // Older characters may not have the basic abilities yet.
    if (actor.type === 'character') actor.ensureBasicAbilities();

    return Object.assign(context, {
      actor,
      system: actor.system,
      flags: actor.flags,
      config: CONFIG.NOQUARTER,
      ...this._prepareItems(),
    });
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs[partId];

    switch (partId) {
      case 'description':
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedBiography =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.actor.system.biography,
            {
              // Whether to show secret blocks in the finished html
              secrets: this.document.isOwner,
              // Data to fill in for inline rolls
              rollData: this.actor.getRollData(),
              // Relative UUID resolution
              relativeTo: this.actor,
            }
          );
        break;
      case 'effects':
        // Effects stored on the actor as well as any on its items
        context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());
        break;
    }
    return context;
  }

  /**
   * Organize and classify Items for Actor sheets.
   * @returns {{gear: Item[], abilities: object[], spells: Record<number, Item[]>}}
   * @protected
   */
  _prepareItems() {
    const gear = [];
    const spells = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

    const items = this.actor.items.contents.sort((a, b) => a.sort - b.sort);
    for (const i of items) {
      if (i.type === 'item') gear.push(i);
      else if (i.type === 'spell' && i.system.spellLevel != undefined) {
        spells[i.system.spellLevel].push(i);
      }
    }

    return { gear, abilities: this._prepareAbilities(), spells };
  }

  /**
   * Build the list of abilities to display: the basic abilities first, in the
   * order they are configured, followed by the rest.
   *
   * @returns {object[]}
   * @protected
   */
  _prepareAbilities() {
    const basicOrder = Object.keys(CONFIG.NOQUARTER.basicAbilities);
    return this.actor.items
      .filter((i) => i.type === 'ability')
      .map((i) => ({
        _id: i.id,
        name: i.name,
        img: i.img || Item.DEFAULT_ICON,
        sort: i.sort,
        basic: !!i.system.basicKey,
        basicIndex: basicOrder.indexOf(i.system.basicKey),
        system: i.system,
        chances: i.system.chances,
      }))
      .sort((a, b) => {
        if (a.basic !== b.basic) return a.basic ? -1 : 1;
        if (a.basic) return a.basicIndex - b.basicIndex;
        return a.sort - b.sort || a.name.localeCompare(b.name);
      });
  }

  /* -------------------------------------------- */

  /**
   * Ability fields edited inline on the sheet belong to the ability item, not
   * the actor, so they are saved separately instead of submitting the form.
   * @override
   */
  _onChangeForm(formConfig, event) {
    if (event.target.classList.contains('ability-field')) {
      return this._onAbilityFieldChange(event);
    }
    return super._onChangeForm(formConfig, event);
  }

  /**
   * Save a change made to an ability's field directly on the actor sheet.
   * @param {Event} event   The originating change event
   * @protected
   */
  async _onAbilityFieldChange(event) {
    const input = event.target;
    const item = this.actor.items.get(input.closest('.item').dataset.itemId);
    if (!item) return;

    const { field, dtype, nullable, min, max } = input.dataset;
    let value = input.value;
    if (dtype === 'Number') {
      if (value.trim() === '' && nullable) {
        // An empty box clears the value.
        value = null;
      } else {
        value = Math.trunc(Number(value));
        if (!Number.isFinite(value)) value = 0;
        if (min !== undefined) value = Math.max(Number(min), value);
        if (max !== undefined) value = Math.min(Number(max), value);
      }
    }

    // A bare number is a distance in feet; show that right away.
    if (field === 'range') input.value = value = formatRange(value);

    // The name is on the item itself and can't be empty.
    if (field === 'name') {
      if (!value.trim()) return this.render();
      return item.update({ name: value });
    }
    // Emptying either uses box removes the limit, so the ability is unlimited
    // again and starts full if a limit is set later.
    if ((field === 'remaining' || field === 'uses') && value === null) {
      return item.update({ 'system.uses': null, 'system.used': 0 });
    }
    // Uses are shown as the number left, but stored as the number used.
    if (field === 'remaining') return item.update({ 'system.used': item.system.uses - value });
    return item.update({ [`system.${field}`]: value });
  }

  /* -------------------------------------------- */

  /**
   * Get the owned Item for the row containing an element.
   * @param {HTMLElement} target
   * @returns {Item|undefined}
   */
  #getItem(target) {
    return this.actor.items.get(target.closest('[data-item-id]').dataset.itemId);
  }

  /**
   * Create a new owned Item using initial data defined in the button's dataset.
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCreateItem(event, target) {
    if (!this.isEditable) return;
    // Anything else on the button, like data-spell-level, is system data.
    const { action, type, ...system } = target.dataset;
    return Item.create(
      { name: `New ${type.capitalize()}`, type, system },
      { parent: this.actor }
    );
  }

  /**
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onEditItem(event, target) {
    this.#getItem(target)?.sheet.render({ force: true });
  }

  /**
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onDeleteItem(event, target) {
    if (!this.isEditable) return;
    return this.#getItem(target)?.delete();
  }

  /**
   * Make a monster's limited-use abilities available again.
   * @this {NoQuarterActorSheet}
   */
  static #onResetUses() {
    if (!this.isEditable) return;
    return this.actor.resetAbilityUses();
  }

  /**
   * Handle clickable rolls.
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onRoll(event, target) {
    if (!this.isEditable) return;
    const dataset = target.dataset;

    // Handle item rolls.
    if (dataset.rollType == 'item') return this.#getItem(target)?.roll();

    // Handle stat rolls (d100 against the stat's success chances).
    if (dataset.rollType == 'stat') return this.actor.rollStat(dataset.stat);

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[stat] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
      });
      return roll;
    }
  }
}
