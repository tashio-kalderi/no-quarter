/**
 * Sheet actions for managing Active Effects from an Actor or Item sheet. Spread
 * into a sheet's `actions` option; each handler is called with the sheet as
 * `this` and receives the clicked element as `target`.
 * @type {Record<string, (this: foundry.applications.api.DocumentSheetV2, event: PointerEvent, target: HTMLElement) => Promise|void>}
 */
export const effectActions = {
  createEffect(event, target) {
    if (!this.isEditable) return;
    const owner = this.document;
    const effectType = target.closest('[data-effect-type]').dataset.effectType;
    return owner.createEmbeddedDocuments('ActiveEffect', [
      {
        name: game.i18n.format('DOCUMENT.New', {
          type: game.i18n.localize('DOCUMENT.ActiveEffect'),
        }),
        img: 'icons/svg/aura.svg',
        origin: owner.uuid,
        duration: effectType === 'temporary' ? { value: 1, units: 'rounds' } : undefined,
        disabled: effectType === 'inactive',
      },
    ]);
  },

  editEffect(event, target) {
    return getEffect(this.document, target)?.sheet.render({ force: true });
  },

  deleteEffect(event, target) {
    if (!this.isEditable) return;
    return getEffect(this.document, target)?.delete();
  },

  toggleEffect(event, target) {
    if (!this.isEditable) return;
    const effect = getEffect(this.document, target);
    return effect?.update({ disabled: !effect.disabled });
  },
};

/**
 * Find the Active Effect for a row on the sheet. On an actor sheet the effect
 * may belong to one of the actor's items rather than the actor itself.
 * @param {Actor|Item} document   The document the sheet is showing
 * @param {HTMLElement} target    An element inside the effect's row
 * @returns {ActiveEffect|undefined}
 */
function getEffect(document, target) {
  const { effectId, parentId } = target.closest('[data-effect-id]').dataset;
  const parent = parentId === document.id ? document : document.items?.get(parentId);
  return parent?.effects.get(effectId);
}

/**
 * Prepare the data structure for Active Effects which are currently embedded in an Actor or Item.
 * @param {ActiveEffect[]} effects    A collection or generator of Active Effect documents to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
  // Define effect header categories
  const categories = {
    temporary: {
      type: 'temporary',
      label: game.i18n.localize('NOQUARTER.Effect.Temporary'),
      effects: [],
    },
    passive: {
      type: 'passive',
      label: game.i18n.localize('NOQUARTER.Effect.Passive'),
      effects: [],
    },
    inactive: {
      type: 'inactive',
      label: game.i18n.localize('NOQUARTER.Effect.Inactive'),
      effects: [],
    },
  };

  // Iterate over active effects, classifying them into categories
  for (let e of effects) {
    if (e.disabled) categories.inactive.effects.push(e);
    else if (e.isTemporary) categories.temporary.effects.push(e);
    else categories.passive.effects.push(e);
  }
  return categories;
}
