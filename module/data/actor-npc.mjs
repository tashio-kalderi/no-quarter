import NoQuarterActorBase from './base-actor.mjs';

/**
 * A monster. Unlike a character it has no individual stats: a single set of
 * Regular/Greater/Extreme success chances (its "Stats" line) is used for every
 * one of its ability checks.
 */
export default class NoQuarterNPC extends NoQuarterActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const chance = (initial) =>
      new fields.NumberField({ ...requiredInteger, initial, min: 0 });
    const schema = super.defineSchema();

    schema.level = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });
    schema.alignment = new fields.StringField({ required: true, blank: true });
    schema.creatureType = new fields.StringField({ required: true, blank: true });
    // Sets the size of the monster's tokens (see NOQUARTER.sizes).
    schema.size = new fields.StringField({
      required: true,
      initial: 'med',
      choices: () => Object.keys(CONFIG.NOQUARTER.sizes),
    });

    // Physical and magical damage reduction.
    schema.pdr = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.mdr = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // The success chances used by every ability, e.g. 70/35/0.
    schema.chances = new fields.SchemaField({
      regular: chance(50),
      greater: chance(0),
      extreme: chance(0),
    });

    // Bosses get boons: extra features, which are boon items.
    schema.isBoss = new fields.BooleanField({ required: true, initial: false });

    return schema;
  }

  /** @override */
  static migrateData(source) {
    // Level used to be called CR.
    if (source.cr !== undefined && source.level === undefined) source.level = source.cr;
    return super.migrateData(source);
  }

  /**
   * How many boons a boss of this level gets: 1 up to level 5, 2 up to level
   * 10 and 3 from level 11. The sheet shows it but doesn't enforce it.
   * @type {number}
   */
  get boonCount() {
    if (this.level <= 5) return 1;
    if (this.level <= 10) return 2;
    return 3;
  }

  getRollData() {
    // Monsters have no stats, but formulas that use the agility rank still need to evaluate.
    return { ...super.getRollData(), lvl: this.level, stats: { agility: { value: 0 } } };
  }
}
