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
      createSkill: NoQuarterActorSheet.#onCreateSkill,
      deleteSkill: NoQuarterActorSheet.#onDeleteSkill,
      breather: NoQuarterActorSheet.#onBreather,
      ...effectActions,
    },
  };

  /**
   * The header and abilities tab are swapped for the actor's type in
   * _configureRenderParts. Characters have a Skills tab where monsters have a
   * Description tab.
   * @override
   */
  static PARTS = {
    header: { template: `${TEMPLATES}/header-character.hbs` },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    abilities: { template: `${TEMPLATES}/tab-abilities-character.hbs`, scrollable: [''] },
    skills: { template: `${TEMPLATES}/tab-skills.hbs`, scrollable: [''] },
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
        { id: 'skills' },
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

  /**
   * Monster sheets open wider: their ability list has more columns.
   * @override
   */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    if (options.document?.type === 'npc') options.position.width = 760;
    return options;
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const type = this.actor.type;
    parts.header.template = `${TEMPLATES}/header-${type}.hbs`;
    parts.abilities.template = `${TEMPLATES}/tab-abilities-${type}.hbs`;
    for (const tab of this.#hiddenTabs()) delete parts[tab];
    return parts;
  }

  /** @override */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== 'primary') return config;
    const hidden = this.#hiddenTabs();
    return { ...config, tabs: config.tabs.filter((t) => !hidden.includes(t.id)) };
  }

  /**
   * The tabs this actor's type doesn't have.
   * @returns {string[]}
   */
  #hiddenTabs() {
    // Monsters don't cast spells or have skills; characters keep skills where
    // monsters have their description.
    return this.actor.type === 'npc' ? ['skills', 'spells'] : ['description'];
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
      // A breather can't be taken mid-fight.
      inCombat: actor.inStartedCombat,
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
      case 'skills':
        context.skillColumns = this._prepareSkills();
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

  /**
   * Group the character's skills by stat for the Skills tab: Might and Mind in
   * the left column, Agility and Personality in the right. Within each stat
   * the basic skills and the character's own are sorted by name together.
   *
   * @returns {{stat: string, label: string, skills: object[]}[][]}
   * @protected
   */
  _prepareSkills() {
    const system = this.actor.system;
    const skills = [
      ...Object.entries(CONFIG.NOQUARTER.basicSkills).map(([key, skill]) => ({
        key,
        name: game.i18n.localize(skill.name),
        stat: skill.stat,
        trained: system.trainedSkills[key],
      })),
      ...system.skills.map((skill, index) => ({
        index,
        custom: true,
        ...skill,
        // Skills added before they were grouped by stat may not have one.
        stat: skill.stat in system.stats ? skill.stat : 'might',
      })),
    ];
    // A new skill has no name yet; keep it at the bottom until it gets one.
    const byName = (a, b) => !a.name - !b.name || a.name.localeCompare(b.name);

    return [
      ['might', 'mind'],
      ['agility', 'personality'],
    ].map((stats) =>
      stats.map((stat) => ({
        stat,
        label: game.i18n.localize(CONFIG.NOQUARTER.stats[stat]),
        skills: skills
          .filter((skill) => skill.stat === stat)
          .sort(byName)
          // A skill uses its stat's success chances.
          .map((skill) => ({ ...skill, chances: system.stats[stat].target })),
      }))
    );
  }

  /* -------------------------------------------- */

  /**
   * Foundry only restores focus after a render to fields with an id or name.
   * Ability and skill fields have neither, so every save (tabbing or clicking
   * into another box) dropped focus. Find them by their row and field instead,
   * and keep the cursor where it was.
   * @override
   */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    const focus = priorElement.querySelector(':focus');
    if (!focus) return;

    const field = focus.dataset.field;
    const row = focus.closest('[data-item-id], [data-skill-index]');
    if (!state.focus && field && row) {
      const key = row.dataset.itemId
        ? `[data-item-id="${row.dataset.itemId}"]`
        : `[data-skill-index="${row.dataset.skillIndex}"]`;
      state.focus = `${key} [data-field="${field}"]`;
    }
    // Only text boxes have a cursor; reading it on other inputs throws.
    try {
      if (focus.selectionStart !== null && focus.selectionStart !== undefined) {
        state.selection = [focus.selectionStart, focus.selectionEnd];
      }
    } catch {}
  }

  /** @override */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (!state.focus || !state.selection) return;
    const focus = newElement.querySelector(state.focus);
    try {
      focus?.setSelectionRange?.(...state.selection);
    } catch {}
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
    if (event.target.classList.contains('skill-field')) {
      return this._onSkillFieldChange(event);
    }
    return super._onChangeForm(formConfig, event);
  }

  /**
   * Save a change made to a skill. Skills are an array, which can only be
   * updated as a whole, so their fields are saved here instead of submitting
   * the form.
   * @param {Event} event   The originating change event
   * @protected
   */
  async _onSkillFieldChange(event) {
    const input = event.target;
    const index = Number(input.closest('[data-skill-index]').dataset.skillIndex);
    const skills = this.actor.system.toObject().skills;
    if (!skills[index]) return;
    const field = input.dataset.field;
    skills[index][field] = input.type === 'checkbox' ? input.checked : input.value;
    return this.actor.update({ 'system.skills': skills });
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
   * Add a skill of the character's own under the button's stat.
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onCreateSkill(event, target) {
    if (!this.isEditable) return;
    const skills = this.actor.system.toObject().skills;
    skills.push({ name: '', stat: target.dataset.stat, trained: false });
    return this.actor.update({ 'system.skills': skills });
  }

  /**
   * Restore health and stamina and clear conditions, see NoQuarterActor#takeBreather.
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onBreather(event, target) {
    if (!this.isEditable) return;
    return this.actor.takeBreather();
  }

  /**
   * @this {NoQuarterActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onDeleteSkill(event, target) {
    if (!this.isEditable) return;
    const index = Number(target.closest('[data-skill-index]').dataset.skillIndex);
    const skills = this.actor.system.toObject().skills;
    skills.splice(index, 1);
    return this.actor.update({ 'system.skills': skills });
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

    // Handle skill rolls (a stat roll under the skill's name, with advantage
    // when trained).
    if (dataset.rollType == 'skill') {
      return this.actor.rollStat(dataset.stat, {
        label: dataset.label,
        skill: dataset.trained === 'true',
      });
    }

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
