import NoQuarterActorBase from './base-actor.mjs';
import { NOQUARTER } from '../helpers/config.mjs';
import { successChances } from '../helpers/success.mjs';

export default class NoQuarterCharacter extends NoQuarterActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.stamina = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 3, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 3 }),
    });

    // Iterate over stat names and create a new SchemaField for each.
    schema.stats = new fields.SchemaField(
      Object.keys(NOQUARTER.stats).reduce((obj, stat) => {
        obj[stat] = new fields.SchemaField({
          // The stat value is its rank.
          value: new fields.NumberField({
            ...requiredInteger,
            initial: 0,
            min: 0,
            max: NOQUARTER.successRules.maxRank,
          }),
        });
        return obj;
      }, {})
    );

    schema.attributes = new fields.SchemaField({
      level: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1 }),
      }),
    });

    return schema;
  }

  /** @override */
  static migrateData(source) {
    // Stats used to be stored as `abilities`.
    if (source.abilities && !source.stats) source.stats = source.abilities;
    return super.migrateData(source);
  }

  prepareDerivedData() {
    // Each stat has Regular/Greater/Extreme success chances based on rank.
    for (const stat of Object.values(this.stats)) {
      stat.target = successChances(stat.value);
    }

    super.prepareDerivedData();

    // Current stamina cannot exceed its maximum.
    this.stamina.value = Math.min(this.stamina.value, this.stamina.max);
  }

  /** @override */
  prepareResourceMaximums() {
    // Health is 3 + Might + Mind; stamina is 3 + Agility + Personality.
    const { might, mind, agility, personality } = this.stats;
    this.health.max = Math.max(0, 3 + might.value + mind.value);
    this.stamina.max = Math.max(0, 3 + agility.value + personality.value);
  }

  getRollData() {
    const data = super.getRollData();

    // Copy the stats to the top level, so that rolls can use
    // formulas like `@might.value + 4`.
    for (const [k, v] of Object.entries(this.stats)) {
      data[k] = foundry.utils.deepClone(v);
    }

    data.lvl = this.attributes.level.value;

    return data;
  }
}
