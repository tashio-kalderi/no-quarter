import {
  effectActions,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const TEMPLATES = 'systems/no-quarter/templates/item';

/**
 * The item sheet for gear, abilities and spells.
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
    parts.attributes.template = `${TEMPLATES}/tab-attributes-${this.item.type}.hbs`;
    // Only abilities have an effects tab.
    if (this.item.type !== 'ability') delete parts.effects;
    return parts;
  }

  /** @override */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== 'primary' || this.item.type === 'ability') return config;
    // Gear and spells lead with their description.
    const order = ['description', 'attributes'];
    return { ...config, tabs: order.map((id) => config.tabs.find((t) => t.id === id)) };
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;

    Object.assign(context, {
      item,
      system: item.system,
      flags: item.flags,
      config: CONFIG.NOQUARTER,
    });
    if (item.type === 'ability') {
      context.chances = item.system.chances;
      // Monster abilities have a damage type, range and uses instead of a stat and rank.
      context.isMonsterAbility = item.actor?.type === 'npc';
    }
    return context;
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
