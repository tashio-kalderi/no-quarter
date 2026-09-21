/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return loadTemplates([
    // Actor partials.
    'systems/no-quarter/templates/actor/parts/actor-abilities.hbs',
    'systems/no-quarter/templates/actor/parts/actor-npc-abilities.hbs',
    'systems/no-quarter/templates/actor/parts/actor-items.hbs',
    'systems/no-quarter/templates/actor/parts/actor-spells.hbs',
    'systems/no-quarter/templates/actor/parts/actor-effects.hbs',
    // Item partials
    'systems/no-quarter/templates/item/parts/item-effects.hbs',
  ]);
};
