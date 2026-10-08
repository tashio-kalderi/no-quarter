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
      usesWounds: actor.usesWounds,
      maxWounds: actor.maxWounds,
      ...this._prepareItems(),
    });
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs[partId];

    switch (partId) {
      case 'abilities':
        if (this.actor.type === 'npc') context.boons = await this._prepareBoons();
        break;
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
   * @returns {{gear: Item[], abilities: object[], spells: Record<number, Item[]>, racialSkills: object[], skills: Item[]}}
   * @protected
   */
  _prepareItems() {
    const gear = [];
    const skills = [];
    const spells = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

    const items = this.actor.items.contents.sort((a, b) => a.sort - b.sort);
    for (const i of items) {
      if (i.type === 'item') gear.push(i);
      else if (i.type === 'skill') skills.push(i);
      else if (i.type === 'spell' && i.system.spellLevel != undefined) {
        spells[i.system.spellLevel].push(i);
      }
    }

    // Skills are listed by name.
    skills.sort((a, b) => a.name.localeCompare(b.name));

    return { gear, skills, abilities: this._prepareAbilities(), spells, racialSkills: this._prepareRacialSkills() };
  }

  /**
   * The character's racial skills, each with a one-line summary of the
   * bonuses it applies, such as "+1 Health · Darkvision 60 ft.".
   * @returns {object[]}
   * @protected
   */
  _prepareRacialSkills() {
    const { visionTypes } = CONFIG.NOQUARTER;
    const signed = (value) => (value > 0 ? `+${value}` : `${value}`);
    return this.actor.items
      .filter((i) => i.type === 'racialSkill')
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((i) => {
        const { health, stamina, speed, vision } = i.system;
        const summary = [];
        if (health) summary.push(game.i18n.format('NOQUARTER.RacialSkill.Health', { value: signed(health) }));
        if (stamina) summary.push(game.i18n.format('NOQUARTER.RacialSkill.Stamina', { value: signed(stamina) }));
        if (speed) summary.push(game.i18n.format('NOQUARTER.RacialSkill.Speed', { value: signed(speed) }));
        if (vision) {
          summary.push(
            game.i18n.format('NOQUARTER.RacialSkill.Vision', {
              vision: game.i18n.localize(visionTypes[vision].label),
              range: visionTypes[vision].range,
            })
          );
        }
        // What the player picked for it, such as a Stat Increase's stat.
        const choice =
          i.system.choice === 'stat' && i.system.stat
            ? game.i18n.localize(CONFIG.NOQUARTER.stats[i.system.stat])
            : '';
        return { _id: i.id, name: i.name, img: i.img || Item.DEFAULT_ICON, choice, summary: summary.join(' · ') };
      });
  }

  /**
   * A boss's boons, each with its description ready to show on the sheet.
   * @returns {Promise<object[]>}
   * @protected
   */
  async _prepareBoons() {
    const { TextEditor } = foundry.applications.ux;
    const boons = this.actor.items
      .filter((i) => i.type === 'boon')
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    return Promise.all(
      boons.map(async (i) => ({
        _id: i.id,
        name: i.name,
        img: i.img || Item.DEFAULT_ICON,
        minLevel: i.system.minLevel,
        tooLow: i.system.minLevel > this.actor.system.level,
        description: await TextEditor.implementation.enrichHTML(i.system.description, {
          secrets: this.document.isOwner,
          rollData: i.getRollData(),
          relativeTo: i,
        }),
      }))
    );
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
   * Foundry only restores focus after a render to fields with an id or name.
   * Ability and skill fields have neither, so every save (tabbing or clicking
   * into another box) dropped focus. Find them by their item's row and field
   * instead, and keep the cursor where it was.
   * @override
   */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    const focus = priorElement.querySelector(':focus');
    if (!focus) return;

    const field = focus.dataset.field;
    const row = focus.closest('[data-item-id]');
    if (!state.focus && field && row) {
      state.focus = `[data-item-id="${row.dataset.itemId}"] [data-field="${field}"]`;
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
   * Racial skills dropped onto the sheet go to the Skills tab wherever they
   * land, like any other item. Only characters can have them, up to
   * NOQUARTER.maxRacialSkills. A skill can only be taken twice if it's
   * repeatable, and an exclusive one (Flight) can't be taken with any other.
   * One that asks for a choice, such as Stat Increase, asks for it first.
   * @override
   */
  async _onDropItem(event, item) {
    if (item.type === 'skill' && item.parent !== this.actor) return this.#onDropSkill(event, item);
    if (item.type === 'boon' && item.parent !== this.actor) return this.#onDropBoon(event, item);
    if (item.type !== 'racialSkill' || item.parent === this.actor) return super._onDropItem(event, item);
    if (!this.actor.isOwner) return null;
    const problem = this.#racialSkillDropProblem(item);
    if (problem) {
      ui.notifications.warn(problem);
      return null;
    }
    if (item.system.choice !== 'stat') return super._onDropItem(event, item);

    const stat = await this.#chooseStat(item);
    if (!stat) return null;
    const data = item.inCompendium ? game.items.fromCompendium(item, { clearFolder: true }) : item.toObject();
    data.system.stat = stat;
    return (await Item.implementation.create(data, { parent: this.actor })) ?? null;
  }

  /**
   * Add a dropped skill, unless the character already has one by that name.
   * Monsters don't have skills.
   * @param {DragEvent} event
   * @param {Item} item   The dropped skill
   * @returns {Promise<Item|null>}
   */
  async #onDropSkill(event, item) {
    if (this.actor.type !== 'character') {
      ui.notifications.warn('NOQUARTER.Skill.CharactersOnly', { localize: true });
      return null;
    }
    const name = item.name.toLowerCase();
    if (this.actor.items.some((i) => i.type === 'skill' && i.name.toLowerCase() === name)) {
      ui.notifications.warn(game.i18n.format('NOQUARTER.Skill.Duplicate', { name: item.name }));
      return null;
    }
    return super._onDropItem(event, item);
  }

  /**
   * Add a dropped boon. Only bosses have boons, but how many they get isn't
   * enforced, and one designed for higher level monsters only warns.
   * @param {DragEvent} event
   * @param {Item} item   The dropped boon
   * @returns {Promise<Item|null>}
   */
  async #onDropBoon(event, item) {
    if (this.actor.type !== 'npc') {
      ui.notifications.warn('NOQUARTER.Boon.MonstersOnly', { localize: true });
      return null;
    }
    if (!this.actor.system.isBoss) {
      ui.notifications.warn('NOQUARTER.Boon.BossesOnly', { localize: true });
      return null;
    }
    const { minLevel } = item.system;
    if (minLevel > this.actor.system.level) {
      ui.notifications.warn(game.i18n.format('NOQUARTER.Boon.TooLow', { level: minLevel }));
    }
    return super._onDropItem(event, item);
  }

  /**
   * Ask which stat a racial skill is for, leaving out the stats the character
   * already picked for other copies of it.
   * @param {Item} item   The dropped racial skill
   * @returns {Promise<string|null>}   The stat, or null if none is left or the dialog was closed
   */
  async #chooseStat(item) {
    const taken = new Set(
      this.actor.items.filter((i) => this.#isSameRacialSkill(i, item)).map((i) => i.system.stat)
    );
    const options = Object.entries(CONFIG.NOQUARTER.stats)
      .filter(([key]) => !taken.has(key))
      .map(([key, label]) => `<option value="${key}">${game.i18n.localize(label)}</option>`);
    if (!options.length) {
      ui.notifications.warn(game.i18n.format('NOQUARTER.RacialSkill.AllStatsChosen', { name: item.name }));
      return null;
    }
    return foundry.applications.api.DialogV2.prompt({
      window: { title: item.name, icon: 'fa-solid fa-arrow-up' },
      content: `<p>${game.i18n.format('NOQUARTER.RacialSkill.ChooseStat', { name: item.name })}</p>
        <select name="stat" autofocus>${options.join('')}</select>`,
      ok: { label: 'NOQUARTER.RacialSkill.Choose', callback: (event, button) => button.form.elements.stat.value },
      rejectClose: false,
    });
  }

  /**
   * Whether an owned item is a copy of a racial skill. A skill from the
   * compendium remembers where it came from, so a renamed copy still counts.
   * @param {Item} owned   An item the actor has
   * @param {Item} item    The racial skill to compare it with
   * @returns {boolean}
   */
  #isSameRacialSkill(owned, item) {
    if (owned.type !== 'racialSkill') return false;
    const source = item.inCompendium ? item.uuid : item._stats.compendiumSource;
    return owned.name === item.name || (!!source && owned._stats.compendiumSource === source);
  }

  /**
   * Why a racial skill can't be added to this actor, if it can't.
   * @param {Item} item   The dropped racial skill
   * @returns {string|undefined}   The warning to show
   */
  #racialSkillDropProblem(item) {
    const i18n = (key, data = {}) => game.i18n.format(key, data);
    if (this.actor.type !== 'character') return i18n('NOQUARTER.RacialSkill.CharactersOnly');
    const owned = this.actor.items.filter((i) => i.type === 'racialSkill');

    const exclusive = owned.find((i) => i.system.exclusive);
    if (exclusive) return i18n('NOQUARTER.RacialSkill.Exclusive', { name: exclusive.name });
    if (item.system.exclusive && owned.length) return i18n('NOQUARTER.RacialSkill.Exclusive', { name: item.name });

    const duplicate = owned.some((i) => this.#isSameRacialSkill(i, item));
    if (duplicate && !item.system.repeatable) return i18n('NOQUARTER.RacialSkill.Duplicate');
    if (owned.length >= CONFIG.NOQUARTER.maxRacialSkills) {
      return i18n('NOQUARTER.RacialSkill.Limit', { max: CONFIG.NOQUARTER.maxRacialSkills });
    }
  }

  /**
   * The Speed box shows Speed with racial skill bonuses included; take them
   * back off so the base value is what gets saved.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const bonus = this.actor.system.bonuses?.speed;
    const speed = data.system?.speed;
    if (bonus && speed !== undefined && speed !== null && speed !== '') {
      data.system.speed = Math.max(0, Number(speed) - bonus);
    }
    return data;
  }

  /**
   * Ability fields edited inline on the sheet belong to the ability item, not
   * the actor, so they are saved separately instead of submitting the form.
   * Skill and boon names are saved to their items the same way.
   * @override
   */
  _onChangeForm(formConfig, event) {
    if (event.target.classList.contains('ability-field')) {
      return this._onAbilityFieldChange(event);
    }
    if (event.target.classList.contains('skill-field') || event.target.classList.contains('boon-field')) {
      return this._onSkillNameChange(event);
    }
    return super._onChangeForm(formConfig, event);
  }

  /**
   * Rename a skill from its box on the Skills tab, or a boon from its box on
   * a boss's sheet. An item can't be left without a name, so emptying the box
   * puts the old name back.
   * @param {Event} event   The originating change event
   * @protected
   */
  async _onSkillNameChange(event) {
    const input = event.target;
    const item = this.#getItem(input);
    if (!item) return;
    const name = input.value.trim();
    if (!name) return this.render();
    return item.update({ name });
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
