export default class NoQuarterActorBase extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.health = new fields.SchemaField({
      // No minimum: Foundry clamps updates to it before NoQuarterActor#_preUpdate
      // runs, which would lose the overflow damage that carries over after a
      // wound. _preUpdate converts any value of 0 or less before it is saved.
      value: new fields.NumberField({ ...requiredInteger, initial: 3 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 3 }),
    });

    // Gained each time health reaches 0 (see NoQuarterActor#_preUpdate).
    schema.wounds = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.biography = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  prepareDerivedData() {
    this.prepareResourceMaximums();

    // Current health cannot exceed its maximum.
    this.health.value = Math.min(this.health.value, this.health.max);
  }

  /**
   * Work out the health (and any other resource) maximums. By default they are
   * simply the stored values; characters derive them from their stats.
   */
  prepareResourceMaximums() {}

  getRollData() {
    return {};
  }
}
