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

    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 30, min: 0 });

    // Physical and magical damage reduction, taken off each hit of that type
    // (see helpers/damage.mjs).
    schema.pdr = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.mdr = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.biography = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  prepareDerivedData() {
    this.bonuses = this.prepareBonuses();
    this.prepareResourceMaximums();

    // Current health cannot exceed its maximum.
    this.health.value = Math.min(this.health.value, this.health.max);

    // Speed bonuses are added on top of the stored `speed`, which stays the
    // base value. Restrained drops Speed to 0 while it lasts; the base value
    // comes back once the condition is toggled off.
    this.restrained = this.parent.statuses.has('restrain');
    this.effectiveSpeed = this.restrained ? 0 : this.speed + this.bonuses.speed;

    // Damage reduction bonuses are added the same way, on top of the stored base.
    this.effectivePdr = this.pdr + this.bonuses.pdr;
    this.effectiveMdr = this.mdr + this.bonuses.mdr;
  }

  /**
   * Bonuses to maximum Health and Stamina, Speed and damage reduction from the
   * actor's items, and the forms of vision they grant. None by default;
   * characters get them from their racial skills and abilities.
   * @returns {{health: number, stamina: number, speed: number, pdr: number, mdr: number, senses: Set<string>}}
   */
  prepareBonuses() {
    return { health: 0, stamina: 0, speed: 0, pdr: 0, mdr: 0, senses: new Set() };
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
