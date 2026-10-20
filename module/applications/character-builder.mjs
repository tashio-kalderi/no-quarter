import { ABILITY_FIELDS, RACIAL_SKILL_FIELDS, catalogItemData, itemCatalog } from '../helpers/catalog.mjs';
import { addRacialSkill, addSkill, racialSkillProblem } from '../helpers/racial-skills.mjs';
import { buildingLocked, finishBuilding, racialStatBonus } from '../helpers/build-mode.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Open the builder by itself: for a new character on the screen of whoever
 * made it, and on level-up for the character's players who are online (or,
 * if it has none, whoever raised the level). Called on init.
 */
export function registerCharacterBuilder() {
  Hooks.on('createActor', (actor, options, userId) => {
    if (actor.type === 'character' && actor.system.building && userId === game.user.id) CharacterBuilder.open(actor);
  });
  Hooks.on('updateActor', (actor, changed, options, userId) => {
    if (!options.noQuarterLevelUp) return;
    const players = game.users.filter((u) => u.active && !u.isGM && actor.testUserPermission(u, 'OWNER'));
    const mine = players.length ? players.includes(game.user) : userId === game.user.id;
    if (mine) CharacterBuilder.open(actor);
  });
}

/**
 * The character builder: a step-by-step window for building a character
 * (race and racial skills, stats, abilities, skills, then details). While the
 * GM has locked character building, players only get stats, abilities and
 * skills, for spending the points a level-up gave them. Every change is made to the
 * character straight away, under the same rules as the sheet (see
 * helpers/build-mode.mjs), so closing it part way loses nothing; the
 * character stays in build mode until Finish.
 */
export class CharacterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {{actor: Actor}} options */
  constructor(options) {
    super(options);
    this.actor = options.actor;
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['no-quarter', 'character-builder', 'themed', 'theme-light'],
    window: { icon: 'fa-solid fa-hammer', resizable: true },
    position: { width: 640, height: 640 },
    // Text boxes (race, name, profession...) save to the character as they change.
    form: { handler: CharacterBuilder.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      step: CharacterBuilder.#onStep,
      statUp: CharacterBuilder.#onStatUp,
      statDown: CharacterBuilder.#onStatDown,
      rankUp: CharacterBuilder.#onRankUp,
      rankDown: CharacterBuilder.#onRankDown,
      addAbility: CharacterBuilder.#onAddAbility,
      addRacialSkill: CharacterBuilder.#onAddRacialSkill,
      addSkill: CharacterBuilder.#onAddSkill,
      addCustomSkill: CharacterBuilder.#onAddCustomSkill,
      removeItem: CharacterBuilder.#onRemoveItem,
      finish: CharacterBuilder.#onFinish,
    },
  };

  static PARTS = {
    tracker: { template: 'systems/no-quarter/templates/builder/tracker.hbs' },
    // Each scrolling box keeps its place when the builder redraws after a change.
    step: {
      template: 'systems/no-quarter/templates/builder/step.hbs',
      scrollable: ['', '.builder-picked', '.builder-available'],
    },
    footer: { template: 'systems/no-quarter/templates/builder/footer.hbs' },
  };

  /**
   * Open the builder for a character, or bring its open one to the front.
   * @param {Actor} actor
   * @returns {CharacterBuilder}
   */
  static open(actor) {
    const id = `no-quarter-builder-${actor.id}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.render({ force: true });
      existing.bringToFront();
      return existing;
    }
    const app = new this({ id, actor });
    app.render({ force: true });
    return app;
  }

  /** @type {Actor} */
  actor;

  /**
   * The steps shown: all of them, or only stats, abilities and skills for a
   * player levelling up while the GM has locked character building. Worked out on each
   * render, so changing the lock changes an open builder too.
   * @type {string[]}
   */
  get #steps() {
    return this.#limited ? LIMITED_STEPS : ALL_STEPS;
  }

  /**
   * Whether this user only gets the stats, abilities and skills steps. A
   * character that has never finished building gets every step regardless.
   */
  get #limited() {
    const finished = !!this.actor.getFlag('no-quarter', 'lockedStats');
    return finished && !game.user.isGM && buildingLocked();
  }

  /** The step being shown, by id, so it stays put if the steps change. */
  #stepId = null;

  /** The index of the step being shown; the first one if it isn't there. */
  get #step() {
    return Math.max(0, this.#steps.indexOf(this.#stepId));
  }

  /** Abilities, skills and racial skills to pick from, loaded once. */
  #catalog = null;

  /** Hooks that redraw the builder when the character changes. */
  #hooks = [];

  /** What's typed in each step's search box, so it survives a redraw. */
  #search = {};

  /** @override */
  get title() {
    const key = this.#limited ? 'NOQUARTER.Builder.LevelUpTitle' : 'NOQUARTER.Builder.Title';
    return game.i18n.format(key, { name: this.actor.name });
  }

  /* -------------------------------------------- */

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const redraw = (doc) => {
      const actor = doc.documentName === 'Actor' ? doc : doc.parent;
      if (actor === this.actor) this.render();
    };
    for (const hook of ['updateActor', 'createItem', 'updateItem', 'deleteItem']) {
      this.#hooks.push([hook, Hooks.on(hook, redraw)]);
    }
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector('.builder-search');
    if (!input) return;
    const step = context.step;
    input.addEventListener('input', () => {
      this.#search[step] = input.value;
      this.#filterAvailable(input.value);
    });
    // Typing here isn't a change to the character, so keep it from submitting the form.
    input.addEventListener('change', (event) => event.stopPropagation());
    this.#filterAvailable(input.value);
  }

  /**
   * Hide the rows to pick from that don't match the search: every word typed
   * has to appear in the row's name or note (group, stats). Headings whose
   * rows are all hidden go too. Done on the page, so nothing is redrawn.
   * @param {string} query
   */
  #filterAvailable(query) {
    const box = this.element.querySelector('.builder-available');
    if (!box) return;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let anyShown = false;
    for (const list of box.querySelectorAll('.builder-list')) {
      let shown = false;
      for (const row of list.querySelectorAll('.builder-row')) {
        const text = row.querySelector('.builder-name')?.textContent.toLowerCase() ?? '';
        const match = words.every((w) => text.includes(w));
        row.hidden = !match;
        shown ||= match;
      }
      for (const empty of list.querySelectorAll('.builder-empty')) empty.hidden = words.length > 0;
      const hideList = words.length > 0 && !shown;
      list.hidden = hideList;
      const heading = list.previousElementSibling;
      if (heading?.tagName === 'H4') heading.hidden = hideList;
      anyShown ||= shown;
    }
    let none = box.querySelector('.builder-no-matches');
    if (!none) {
      none = document.createElement('p');
      none.className = 'builder-empty builder-no-matches';
      none.textContent = game.i18n.localize('NOQUARTER.Builder.NoMatches');
      box.append(none);
    }
    none.hidden = !words.length || anyShown;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#catalog ??= {
      abilities: await itemCatalog('ability', ABILITY_FIELDS),
      skills: await itemCatalog('skill'),
      racialSkills: await itemCatalog('racialSkill', RACIAL_SKILL_FIELDS),
    };
    const actor = this.actor;
    const step = this.#steps[this.#step];
    Object.assign(context, {
      actor,
      system: actor.system,
      progression: actor.system.progression,
      building: actor.system.building,
      step,
      steps: this.#steps.map((id, i) => ({
        id,
        index: i,
        number: i + 1,
        label: game.i18n.localize(`NOQUARTER.Builder.Step.${id}`),
        active: i === this.#step,
      })),
      isFirst: this.#step === 0,
      isLast: this.#step === this.#steps.length - 1,
      search: this.#search[step] ?? '',
    });
    switch (step) {
      case 'race':
        Object.assign(context, this.#prepareRace());
        break;
      case 'stats':
        context.stats = this.#prepareStats();
        break;
      case 'abilities':
        context.abilitySections = this.#prepareAbilities();
        break;
      case 'skills':
        Object.assign(context, this.#prepareSkills());
        break;
    }
    return context;
  }

  /** The highest of some stats as the character allocated them. */
  #highestStat(stats) {
    const base = this.actor._source.system.stats;
    return Math.max(0, ...[...(stats ?? [])].map((k) => base[k]?.value ?? 0));
  }

  /** The stats' abbreviations, such as "MIG / AGI". */
  #statsLabel(stats) {
    const order = Object.keys(CONFIG.NOQUARTER.stats);
    return [...(stats ?? [])]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((k) => game.i18n.localize(CONFIG.NOQUARTER.statAbbreviations[k]))
      .join(' / ');
  }

  #prepareRace() {
    const actor = this.actor;
    const owned = actor.items
      .filter((i) => i.type === 'racialSkill')
      .map((i) => {
        let choice = '';
        if (i.system.choice === 'stat' && i.system.stat) choice = game.i18n.localize(CONFIG.NOQUARTER.stats[i.system.stat]);
        else if (i.system.choice === 'skill') choice = i.system.skillName;
        else if (i.system.choice === 'ability') choice = i.system.abilityName;
        return { id: i.id, name: i.name, img: i.img, choice };
      });
    // racialSkillProblem only reads `system` and `name`, so a catalog entry stands in for the item.
    const available = this.#catalog.racialSkills.map((e) => {
      const problem = racialSkillProblem(actor, { name: e.name, uuid: e.uuid, inCompendium: true, system: e.system });
      return { ...e, problem };
    });
    return { racialSkills: owned, racialSkillCatalog: available, maxRacialSkills: CONFIG.NOQUARTER.maxRacialSkills };
  }

  #prepareStats() {
    const { statCap, stats: points } = this.actor.system.progression;
    const base = this.actor._source.system.stats;
    return Object.entries(CONFIG.NOQUARTER.stats).map(([key, label]) => {
      const value = base[key]?.value ?? 0;
      // Ranks from Stat Increases go with the racial skill, so they can't be taken off here.
      const racial = racialStatBonus(this.actor, key);
      return {
        key,
        label: game.i18n.localize(label),
        value,
        racial,
        canUp: value < statCap && points.remaining > 0,
        canDown: value > racial,
      };
    });
  }

  #prepareAbilities() {
    const actor = this.actor;
    const remaining = actor.system.progression.abilities.remaining;
    const ownedNames = new Set();
    const owned = actor.items
      .filter((i) => i.type === 'ability')
      .map((i) => {
        ownedNames.add(i.name.toLowerCase());
        const { rank, minRank, maxRank, stats, actionType } = i.system;
        const current = rank ?? 0;
        // From 0 the first step takes the ability at its minimum rank.
        const next = current === 0 ? minRank : current + 1;
        return {
          id: i.id,
          name: i.name,
          img: i.img,
          actionType,
          rank: current,
          minRank,
          maxRank,
          statsLabel: this.#statsLabel(stats),
          special: i.system.isSpecial,
          basic: !!i.system.basicKey,
          canUp: next <= maxRank && next <= this.#highestStat(stats) && next - current <= remaining,
          canDown: current > 0,
        };
      });
    const available = this.#catalog.abilities
      .filter((e) => e.system.conditionChoice || !ownedNames.has(e.name.toLowerCase()))
      .map((e) => {
        const minRank = e.system.minRank ?? 1;
        const highest = this.#highestStat(e.system.stats);
        let problem = '';
        if (highest < minRank) {
          problem = game.i18n.format('NOQUARTER.Builder.NeedsStat', { stats: this.#statsLabel(e.system.stats), rank: minRank });
        } else if (minRank > remaining) problem = game.i18n.localize('NOQUARTER.Builder.NotEnoughPoints');
        return {
          ...e,
          actionType: e.system.actionType ?? 'full',
          minRank,
          maxRank: e.system.maxRank ?? CONFIG.NOQUARTER.successRules.maxRank,
          statsLabel: this.#statsLabel(e.system.stats),
          effect: e.system.effect,
          special: (e.system.actionType ?? 'full') === 'supplemental' && !!e.system.special,
          problem,
        };
      });
    return Object.entries(CONFIG.NOQUARTER.actionTypes).map(([type, { section }]) => ({
      type,
      label: game.i18n.localize(section),
      owned: owned.filter((a) => a.actionType === type),
      available: available.filter((a) => a.actionType === type),
    }));
  }

  #prepareSkills() {
    const actor = this.actor;
    // Skills a Profession added go with it, so they're removed with it, not here.
    const linked = new Set(actor.items.filter((i) => i.type === 'racialSkill').map((i) => i.system.skillId));
    const owned = actor.items
      .filter((i) => i.type === 'skill')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ id: i.id, name: i.name, fromProfession: linked.has(i.id) }));
    const ownedNames = new Set(owned.map((s) => s.name.toLowerCase()));
    const groups = new Map();
    for (const e of this.#catalog.skills) {
      if (ownedNames.has(e.name.toLowerCase())) continue;
      if (!groups.has(e.group)) groups.set(e.group, []);
      groups.get(e.group).push(e);
    }
    const skillGroups = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, skills]) => ({ label, skills }));
    return { skills: owned, skillGroups, canAddSkill: actor.system.progression.skills.remaining > 0 };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Save the text boxes (race, name, gender, alignment, profession).
   * @this {CharacterBuilder}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    delete data.customSkill;
    if (!Object.keys(data).length) return;
    if (data.name !== undefined && !data.name.trim()) delete data.name;
    await this.actor.update(data);
  }

  /**
   * Go to another step: back, next, or one picked from the list.
   * @this {CharacterBuilder}
   */
  static #onStep(event, target) {
    const { to } = target.dataset;
    const steps = this.#steps;
    let index = this.#step;
    if (to === 'prev') index -= 1;
    else if (to === 'next') index += 1;
    else index = Number(to);
    this.#stepId = steps[Math.clamp(index, 0, steps.length - 1)];
    this.render();
  }

  /** @this {CharacterBuilder} */
  static #onStatUp(event, target) {
    return this.#changeStat(target.dataset.stat, 1);
  }

  /** @this {CharacterBuilder} */
  static #onStatDown(event, target) {
    return this.#changeStat(target.dataset.stat, -1);
  }

  #changeStat(stat, delta) {
    const value = (this.actor._source.system.stats[stat]?.value ?? 0) + delta;
    return this.actor.update({ [`system.stats.${stat}.value`]: Math.max(0, value) });
  }

  /**
   * Raise an ability a rank; from 0 it's taken at its minimum rank.
   * @this {CharacterBuilder}
   */
  static #onRankUp(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const rank = item.system.rank ?? 0;
    return item.update({ 'system.rank': rank === 0 ? item.system.minRank : rank + 1 });
  }

  /**
   * Lower an ability a rank; below its minimum it goes back to 0 (not taken).
   * @this {CharacterBuilder}
   */
  static #onRankDown(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const rank = (item.system.rank ?? 0) - 1;
    return item.update({ 'system.rank': rank < item.system.minRank ? 0 : rank });
  }

  /**
   * Take an ability from the list, at its minimum rank.
   * @this {CharacterBuilder}
   */
  static async #onAddAbility(event, target) {
    const data = await catalogItemData(target.dataset.uuid);
    if (!data) return;
    delete data._id;
    data.system.rank = data.system.minRank ?? 1;
    return Item.implementation.create(data, { parent: this.actor });
  }

  /** @this {CharacterBuilder} */
  static async #onAddRacialSkill(event, target) {
    const item = await fromUuid(target.dataset.uuid);
    if (item) return addRacialSkill(this.actor, item);
  }

  /** @this {CharacterBuilder} */
  static async #onAddSkill(event, target) {
    const data = await catalogItemData(target.dataset.uuid);
    if (!data) return;
    delete data._id;
    return addSkill(this.actor, data);
  }

  /**
   * Add a skill typed by name.
   * @this {CharacterBuilder}
   */
  static async #onAddCustomSkill(event, target) {
    const input = this.element.querySelector('input[name="customSkill"]');
    const name = input?.value.trim();
    if (!name) return;
    const created = await addSkill(this.actor, { name, type: 'skill' });
    if (created && input) input.value = '';
  }

  /** @this {CharacterBuilder} */
  static #onRemoveItem(event, target) {
    return this.actor.items.get(target.dataset.itemId)?.delete();
  }

  /** @this {CharacterBuilder} */
  static async #onFinish() {
    if (await finishBuilding(this.actor)) this.close();
  }
}

/** Every step, and the ones a player gets while character building is locked. */
const ALL_STEPS = ['race', 'stats', 'abilities', 'skills', 'details'];
const LIMITED_STEPS = ['stats', 'abilities', 'skills'];
