// Import document classes.
import { NoQuarterActor } from './documents/actor.mjs';
import { NoQuarterItem } from './documents/item.mjs';
// Import sheet classes.
import { NoQuarterActorSheet } from './sheets/actor-sheet.mjs';
import { NoQuarterItemSheet } from './sheets/item-sheet.mjs';
// Import application classes.
import { NoQuarterCombatTracker } from './applications/combat-tracker.mjs';
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { NOQUARTER } from './helpers/config.mjs';
import { registerWoundBadge } from './helpers/token-badge.mjs';
import { registerStackableConditions, registerConditionTurnEffects } from './helpers/conditions.mjs';
import { registerTurnOrder, registerTurnReferee } from './helpers/turns.mjs';
import { registerMovementRuler } from './helpers/movement-ruler.mjs';
// Import DataModel classes.
import * as models from './data/_module.mjs';

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function () {
  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.noquarter = {
    NoQuarterActor,
    NoQuarterItem,
    rollItemMacro,
  };

  // Add custom constants for configuration.
  CONFIG.NOQUARTER = NOQUARTER;

  // Show wounds on tokens.
  registerWoundBadge();

  // Some status effects in the Token HUD stack instead of being a plain
  // on/off toggle; see module/helpers/conditions.mjs.
  registerStackableConditions();

  // There is no initiative roll. Each round the GM declares which side goes
  // first and the sides then take turns, see helpers/turns.mjs.
  CONFIG.ui.combat = NoQuarterCombatTracker;
  registerTurnOrder();

  // Color a combatant's movement ruler green/yellow/red against their Speed
  // stat while it's their active turn.
  registerMovementRuler();

  // Define custom Document and DataModel classes.
  // The types themselves are declared under `documentTypes` in system.json.
  CONFIG.Actor.documentClass = NoQuarterActor;
  CONFIG.Actor.dataModels = {
    character: models.NoQuarterCharacter,
    npc: models.NoQuarterNPC,
  };
  CONFIG.Item.documentClass = NoQuarterItem;
  CONFIG.Item.dataModels = {
    item: models.NoQuarterItem,
    ability: models.NoQuarterAbility,
    spell: models.NoQuarterSpell,
  };

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  Actors.unregisterSheet('core', ActorSheet);
  Actors.registerSheet('no-quarter', NoQuarterActorSheet, {
    makeDefault: true,
    label: 'NOQUARTER.SheetLabels.Actor',
  });
  Items.unregisterSheet('core', ItemSheet);
  Items.registerSheet('no-quarter', NoQuarterItemSheet, {
    makeDefault: true,
    label: 'NOQUARTER.SheetLabels.Item',
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper('toLowerCase', function (str) {
  return str.toLowerCase();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // The GM's client unlocks sides and passes the turn between them.
  registerTurnReferee();

  // The GM's client applies each stackable condition's start/end-of-turn
  // effect (e.g. Bleeding damage) as combatants start and finish their turn.
  registerConditionTurnEffects();

  // Limited-use monster abilities come back when a combat ends.
  Hooks.on('deleteCombat', (combat) => {
    if (!game.users.activeGM?.isSelf) return;
    for (const combatant of combat.combatants) combatant.actor?.resetAbilityUses();
  });

  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.noquarter.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'no-quarter.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}
