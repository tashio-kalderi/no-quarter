/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  // Sheet templates aren't listed: ApplicationV2 sheets load their own parts.
  return foundry.applications.handlebars.loadTemplates([
    // Combat tracker.
    'systems/no-quarter/templates/combat/header.hbs',
    'systems/no-quarter/templates/combat/tracker.hbs',
    'systems/no-quarter/templates/combat/footer.hbs',
  ]);
};
