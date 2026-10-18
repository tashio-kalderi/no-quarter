import { defaultProgression, progressionTable } from '../helpers/progression.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Character Progression settings window: a row per level with the stat
 * points, ability points and skills gained on reaching it and that level's
 * stat cap, and whether points can be respent freely. GM only.
 */
export class ProgressionConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'no-quarter-progression',
    tag: 'form',
    classes: ['no-quarter', 'progression-config'],
    window: { title: 'NOQUARTER.Progression.Title', icon: 'fa-solid fa-stairs', contentClasses: ['standard-form'] },
    position: { width: 520 },
    form: { handler: ProgressionConfig.#onSubmit, closeOnSubmit: true },
    actions: { reset: ProgressionConfig.#onReset },
  };

  static PARTS = {
    form: { template: 'systems/no-quarter/templates/settings/progression.hbs' },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /**
   * The rows shown in the form. Reset fills them with the defaults without
   * saving, so the GM can still cancel.
   * @type {object[]|null}
   */
  #rows = null;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const rows = this.#rows ?? progressionTable();
    context.rows = rows.map((row, i) => ({ ...row, level: i + 1 }));
    context.maxRank = CONFIG.NOQUARTER.successRules.maxRank;
    context.freeRespec = game.settings.get('no-quarter', 'freeRespec');
    context.buttons = [
      { type: 'button', action: 'reset', icon: 'fa-solid fa-arrow-rotate-left', label: 'NOQUARTER.Progression.Reset' },
      { type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'SETTINGS.Save' },
    ];
    return context;
  }

  /**
   * Fill the table with the default progression. It's saved with Save.
   * @this {ProgressionConfig}
   */
  static #onReset() {
    this.#rows = defaultProgression();
    this.render();
  }

  /**
   * Save the table and the respec option.
   * @this {ProgressionConfig}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const maxRank = CONFIG.NOQUARTER.successRules.maxRank;
    const count = (value, max = Infinity) => Math.clamp(Math.trunc(Number(value)) || 0, 0, max);
    const rows = Object.keys(data.rows ?? {})
      .sort((a, b) => a - b)
      .map((i) => {
        const row = data.rows[i];
        return {
          statPoints: count(row.statPoints),
          abilityPoints: count(row.abilityPoints),
          skills: count(row.skills),
          statCap: count(row.statCap, maxRank),
        };
      });
    await game.settings.set('no-quarter', 'progression', rows);
    await game.settings.set('no-quarter', 'freeRespec', !!data.freeRespec);
  }
}
