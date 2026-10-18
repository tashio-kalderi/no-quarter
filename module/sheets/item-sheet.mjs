import {
  effectActions,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { rankableAbilities } from '../helpers/racial-skills.mjs';
import { racialSkillChoice } from '../helpers/progression.mjs';
import { statusList } from '../helpers/damage.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const TEMPLATES = 'systems/no-quarter/templates/item';

/** Item types whose sheet has only a description. */
const DESCRIPTION_ONLY = ['skill', 'boon'];

/**
 * The item sheet for gear, abilities, spells, racial skills, skills and boons.
 * @extends {ItemSheetV2}
 */
export class NoQuarterItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    // The sheet CSS is written for a light background, so don't follow the
    // user's dark interface theme.
    classes: ['no-quarter', 'item', 'themed', 'theme-light'],
    position: { width: 520, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: { ...effectActions },
  };

  /**
   * The attributes tab is swapped for the item's type in _configureRenderParts.
   * @override
   */
  static PARTS = {
    header: { template: `${TEMPLATES}/header.hbs` },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    attributes: { template: `${TEMPLATES}/tab-attributes-item.hbs` },
    description: { template: `${TEMPLATES}/tab-description.hbs` },
    effects: { template: 'systems/no-quarter/templates/shared/tab-effects.hbs', scrollable: [''] },
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [{ id: 'attributes' }, { id: 'description' }, { id: 'effects' }],
      initial: 'description',
      labelPrefix: 'NOQUARTER.Tabs',
    },
  };

  /* -------------------------------------------- */

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    // Skills and boons are just a description.
    if (DESCRIPTION_ONLY.includes(this.item.type)) delete parts.attributes;
    else parts.attributes.template = `${TEMPLATES}/tab-attributes-${this.item.type}.hbs`;
    // Only abilities have an effects tab.
    if (this.item.type !== 'ability') delete parts.effects;
    return parts;
  }

  /** @override */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== 'primary' || this.item.type === 'ability') return config;
    // Gear, spells and racial skills lead with their description, and skills
    // and boons have nothing else.
    const order = DESCRIPTION_ONLY.includes(this.item.type) ? ['description'] : ['description', 'attributes'];
    return { ...config, tabs: order.map((id) => config.tabs.find((t) => t.id === id)) };
  }

  /* -------------------------------------------- */

  /**
   * A basic attack's damage box shows its bonuses from abilities such as
   * Increase Damage; take them back off so the base is what gets saved.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const bonus = this.item.system.basicKey ? this.item.system.damageBonus : 0;
    const damage = data.system?.damage;
    if (bonus && damage !== undefined && damage !== null && damage !== '') {
      data.system.damage = Math.max(0, Number(damage) - bonus);
    }
    return data;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    context.isGM = game.user.isGM;

    Object.assign(context, {
      item,
      system: item.system,
      flags: item.flags,
      config: CONFIG.NOQUARTER,
    });
    if (item.type === 'racialSkill') {
      context.visionChoices = Object.fromEntries(
        Object.entries(CONFIG.NOQUARTER.visionTypes).map(([key, { label, range }]) => [
          key,
          `${game.i18n.localize(label)} (${range} ft.)`,
        ])
      );
      // The SRD Ability racial skill asks for an ability even if its choice wasn't saved.
      context.choice = racialSkillChoice(item);
      if (item.actor) {
        context.statChoices = this.#statChoices();
        if (context.choice === 'ability') {
          // The abilities it could be for, and the one it's for now.
          const options = rankableAbilities(item.actor, item);
          const linked = item.system.linkedAbility;
          if (linked && !options.includes(linked)) options.unshift(linked);
          context.abilityChoices = Object.fromEntries(
            options.map((i) => [i.id, `${i.name} (${game.i18n.localize('NOQUARTER.RacialSkill.Rank')} ${i.system.rank ?? 0})`])
          );
        }
      }
    }
    if (item.type === 'ability') {
      context.chances = item.system.chances;
      // Monster abilities have a damage type, range and uses instead of a stat and rank.
      context.isMonsterAbility = item.actor?.type === 'npc';
      // A player only changes a character's ability's rank, stats and type in build mode.
      context.buildLocked = item.actor?.type === 'character' && !game.user.isGM && !item.actor.system.building;
      context.statsField = item.system.schema.fields.stats;
      context.statsValue = [...item.system.stats];
      context.basicAttacksField = item.system.schema.fields.basicAttacks;
      context.basicAttacksValue = [...item.system.basicAttacks];
      context.conditionChoices = Object.fromEntries(
        statusList()
          .filter((s) => s.id && s.id !== 'dead')
          .map((s) => [s.id, game.i18n.localize(s.name)])
          .sort((a, b) => a[1].localeCompare(b[1]))
      );
      context.automationChoices = { '': 'NOQUARTER.Automation.none', ...CONFIG.NOQUARTER.abilityAutomations };
      context.actionTypeChoices = Object.fromEntries(
        Object.entries(CONFIG.NOQUARTER.actionTypes).map(([key, { label }]) => [key, label])
      );
    }
    return context;
  }

  /**
   * The stats an owned racial skill can be changed to, leaving out the ones
   * other copies of it on the character already picked, as dropping it does.
   * A copy from the compendium remembers where it came from, so a renamed copy
   * still counts.
   * @returns {Record<string, string>}
   */
  #statChoices() {
    const item = this.item;
    const source = item._stats.compendiumSource;
    const taken = new Set(
      item.actor.items
        .filter(
          (i) =>
            i.type === 'racialSkill' &&
            i.id !== item.id &&
            (i.name === item.name || (!!source && i._stats.compendiumSource === source))
        )
        .map((i) => i.system.stat)
    );
    return Object.fromEntries(Object.entries(CONFIG.NOQUARTER.stats).filter(([key]) => !taken.has(key)));
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs[partId];

    switch (partId) {
      case 'description':
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.item.system.description,
            {
              // Whether to show secret blocks in the finished html
              secrets: this.document.isOwner,
              // Data to fill in for inline rolls
              rollData: this.item.getRollData(),
              // Relative UUID resolution
              relativeTo: this.item,
            }
          );
        break;
      case 'effects':
        context.effects = prepareActiveEffectCategories(this.item.effects);
        break;
    }
    return context;
  }
}
