import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { formatRange } from '../helpers/range.mjs';

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class NoQuarterActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['no-quarter', 'sheet', 'actor'],
      width: 660,
      height: 600,
      tabs: [
        {
          navSelector: '.sheet-tabs',
          contentSelector: '.sheet-body',
          initial: 'abilities',
        },
      ],
    });
  }

  /** @override */
  get template() {
    return `systems/no-quarter/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    const actorData = this.document;

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Adding a pointer to CONFIG.NOQUARTER
    context.config = CONFIG.NOQUARTER;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      // Older characters may not have the basic abilities yet.
      this.actor.ensureBasicAbilities();
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actorData.type == 'npc') {
      this._prepareItems(context);
    }

    // Enrich biography info for display
    // Enrichment turns text like `[[/r 1d20]]` into buttons
    context.enrichedBiography = await TextEditor.enrichHTML(
      this.actor.system.biography,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Necessary in v11, can be removed in v12
        async: true,
        // Data to fill in for inline rolls
        rollData: this.actor.getRollData(),
        // Relative UUID resolution
        relativeTo: this.actor,
      }
    );

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(
      // A generator that returns all effects stored on the actor
      // as well as any items
      this.actor.allApplicableEffects()
    );

    return context;
  }

  /**
   * Character-specific context modifications
   *
   * @param {object} context The context object to mutate
   */
  _prepareCharacterData(context) {
    // This is where you can enrich character-specific editor fields
    // or setup anything else that's specific to this type
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const spells = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
    };

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      // Append to gear.
      if (i.type === 'item') {
        gear.push(i);
      }
      // Append to spells.
      else if (i.type === 'spell') {
        if (i.system.spellLevel != undefined) {
          spells[i.system.spellLevel].push(i);
        }
      }
    }

    // Assign and return
    context.gear = gear;
    context.abilities = this._prepareAbilities();
    context.spells = spells;
  }

  /**
   * Build the list of abilities to display: the basic abilities first, in the
   * order they are configured, followed by the rest.
   *
   * @returns {object[]}
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

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.on('click', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.on('click', '.item-create', this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.on('click', '.item-delete', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Active Effect management
    html.on('click', '.effect-control', (ev) => {
      const row = ev.currentTarget.closest('li');
      const document =
        row.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, document);
    });

    // Inline editing of ability fields (rank, stamina cost, effect/notes).
    html.on('change', '.ability-field', this._onAbilityFieldChange.bind(this));

    // Make a monster's limited-use abilities available again.
    html.on('click', '.uses-reset', () => this.actor.resetAbilityUses());

    // Rollable stats and abilities.
    html.on('click', '.rollable', this._onRoll.bind(this));

    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = { ...header.dataset };
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system['type'];

    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Save a change made to an ability's field directly on the actor sheet.
   * @param {Event} event   The originating change event
   * @private
   */
  async _onAbilityFieldChange(event) {
    const input = event.currentTarget;
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
      if (!value.trim()) return this.render(false);
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

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle stat rolls (d100 against the stat's success chances).
    if (dataset.rollType == 'stat') {
      return this.actor.rollStat(dataset.stat);
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[stat] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }
}
