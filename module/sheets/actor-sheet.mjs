import {
  effectActions,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { formatRange } from '../helpers/range.mjs';
import { buildingLocked, finishBuilding } from '../helpers/build-mode.mjs';
import { addRacialSkill, addSkill } from '../helpers/racial-skills.mjs';
import { CharacterBuilder } from '../applications/character-builder.mjs';

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
      enterBuild: NoQuarterActorSheet.#onEnterBuild,
      finishBuild: NoQuarterActorSheet.#onFinishBuild,
      openBuilder: NoQuarterActorSheet.#onOpenBuilder,
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
      build: this._prepareBuild(),
      ...this._prepareItems(),
    });
  }

  /**
   * A character's build mode: whether it's on, whether this user can turn it
   * on and change what it covers, and the points left to spend. Players can
   * only change stats, ability ranks and skills while building; GMs always can.
   * @returns {object|null}   Null for monsters
   * @protected
   */
  _prepareBuild() {
    const actor = this.actor;
    if (actor.type !== 'character') return null;
    const isGM = game.user.isGM;
    const { building, progression } = actor.system;
    return {
      building,
      canEnter: this.isEditable && !building && (isGM || !buildingLocked()),
      canEdit: this.isEditable && (isGM || building),
      // The stat boxes show stats as allocated: with effects included, saving
      // the form would write the effect into the stat.
      sourceStats: Object.fromEntries(Object.entries(actor._source.system.stats).map(([k, v]) => [k, v.value])),
      levelLocked: !isGM && buildingLocked(),
      progression,
    };
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
   * @returns {{gear: Item[], abilities: object[], abilitySections: object[], spells: Record<number, Item[]>, racialSkills: object[], skills: Item[]}}
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

    const abilities = this._prepareAbilities();
    return {
      gear,
      skills,
      abilities,
      abilitySections: this._prepareAbilitySections(abilities),
      spells,
      racialSkills: this._prepareRacialSkills(),
    };
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
        // What the player picked for it, such as a Stat Increase's stat or a
        // Profession's skill.
        let choice = '';
        if (i.system.choice === 'stat' && i.system.stat) {
          choice = game.i18n.localize(CONFIG.NOQUARTER.stats[i.system.stat]);
        } else if (i.system.choice === 'skill') choice = i.system.skillName;
        else if (i.system.choice === 'ability') choice = i.system.abilityName;
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
        ...this._abilityStatInfo(i),
      }))
      .sort((a, b) => {
        if (a.basic !== b.basic) return a.basic ? -1 : 1;
        if (a.basic) return a.basicIndex - b.basicIndex;
        return a.sort - b.sort || a.name.localeCompare(b.name);
      });
  }

  /**
   * How a character's ability shows its stats: their abbreviations with the
   * highest one marked, the most a player may type in the rank box, and a
   * warning when an effect has lowered the stat below the ability's rank.
   * @param {Item} item
   * @returns {{statList: object[], rankMax: number, cappedTooltip: string}}
   * @protected
   */
  _abilityStatInfo(item) {
    const { stats, highestStat, rankCapped, effectiveRank } = item.system;
    if (!stats) return {};
    const statList = [...stats]
      .sort((a, b) => Object.keys(CONFIG.NOQUARTER.stats).indexOf(a) - Object.keys(CONFIG.NOQUARTER.stats).indexOf(b))
      .map((key) => ({
        key,
        abbr: game.i18n.localize(CONFIG.NOQUARTER.statAbbreviations[key]),
        highest: stats.size > 1 && key === highestStat?.key,
      }));
    // Players can't type a rank above the ability's maximum or their highest
    // stat as allocated; GMs can.
    const maxRank = game.user.isGM ? CONFIG.NOQUARTER.successRules.maxRank : item.system.maxRank;
    let rankMax = maxRank;
    if (!game.user.isGM && stats.size && this.actor.type === 'character') {
      const base = this.actor._source.system.stats;
      rankMax = Math.min(maxRank, Math.max(...[...stats].map((key) => base[key]?.value ?? 0)));
    }
    const cappedTooltip = rankCapped
      ? game.i18n.format('NOQUARTER.AbilityRank.Capped', {
          stat: game.i18n.localize(CONFIG.NOQUARTER.stats[highestStat.key]),
          value: effectiveRank,
        })
      : '';
    return { statList, rankMax, cappedTooltip };
  }

  /**
   * Split a character's abilities into a section per action type, in the
   * order the types are configured. Every section is shown, even when empty,
   * so new abilities can be added to it.
   * @param {object[]} abilities   From _prepareAbilities
   * @returns {{type: string, label: string, abilities: object[]}[]}
   * @protected
   */
  _prepareAbilitySections(abilities) {
    return Object.entries(CONFIG.NOQUARTER.actionTypes).map(([type, { section }]) => ({
      type,
      label: game.i18n.localize(section),
      abilities: abilities.filter((a) => a.system.actionType === type),
    }));
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
   * land, like any other item. The rules for taking them, and the choice some
   * ask for, are in helpers/racial-skills.mjs, shared with the character builder.
   * @override
   */
  async _onDropItem(event, item) {
    if (item.type === 'skill' && item.parent !== this.actor) return this.#onDropSkill(event, item);
    if (item.type === 'boon' && item.parent !== this.actor) return this.#onDropBoon(event, item);
    if (item.type !== 'racialSkill' || item.parent === this.actor) return super._onDropItem(event, item);
    return addRacialSkill(this.actor, item);
  }

  /**
   * Add a dropped skill, unless the character already has one by that name.
   * Monsters don't have skills.
   * @param {DragEvent} event
   * @param {Item} item   The dropped skill
   * @returns {Promise<Item|null>}
   */
  async #onDropSkill(event, item) {
    const data = item.inCompendium ? game.items.fromCompendium(item, { clearFolder: true }) : item.toObject();
    delete data._id;
    return addSkill(this.actor, data);
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
    // A refused change (such as a rank the rules don't allow) puts the old value back in the box.
    const updated = await item.update({ [`system.${field}`]: value });
    if (!updated) this.render();
    return updated;
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
   * Enter build mode (see helpers/build-mode.mjs) and open the character builder.
   * @this {NoQuarterActorSheet}
   */
  static async #onEnterBuild() {
    if (await this.actor.update({ 'system.building': true })) CharacterBuilder.open(this.actor);
  }

  /**
   * Open the character builder while building.
   * @this {NoQuarterActorSheet}
   */
  static #onOpenBuilder() {
    CharacterBuilder.open(this.actor);
  }

  /**
   * Finish building, locking in what was spent.
   * @this {NoQuarterActorSheet}
   */
  static #onFinishBuild() {
    return finishBuilding(this.actor);
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
