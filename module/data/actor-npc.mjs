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

    // Physical and magical damage reduction.
    schema.pdr = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.mdr = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // The success chances used by every ability, e.g. 70/35/0.
    schema.chances = new fields.SchemaField({
      regular: chance(50),
      greater: chance(0),
      extreme: chance(0),
    });

    // Bosses can opt in to the wound rules. Other monsters simply die when their
    // health reaches 0.
    schema.usesWounds = new fields.BooleanField({ required: true, initial: false });

    return schema;
  }

  /** @override */
  static migrateData(source) {
    // Level used to be called CR.
    if (source.cr !== undefined && source.level === undefined) source.level = source.cr;
    return super.migrateData(source);
  }

  getRollData() {
    // Monsters have no stats, but formulas that use the agility rank still need to evaluate.
    return { ...super.getRollData(), lvl: this.level, stats: { agility: { value: 0 } } };
  }
}
