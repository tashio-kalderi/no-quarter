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

    schema.race = new fields.StringField({ required: true, blank: true });
    schema.gender = new fields.StringField({ required: true, blank: true });
    schema.alignment = new fields.StringField({ required: true, blank: true });

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

    schema.profession = new fields.SchemaField({
      name: new fields.StringField({ required: true, blank: true }),
      description: new fields.StringField({ required: true, blank: true }),
    });

    // Skills are named checks made with one of the stats; their success
    // chances are the stat's. Every character has the basic skills, so only
    // whether they are trained in each is stored.
    schema.trainedSkills = new fields.SchemaField(
      Object.keys(NOQUARTER.basicSkills).reduce((obj, key) => {
        obj[key] = new fields.BooleanField();
        return obj;
      }, {})
    );

    // Skills the character has added of their own.
    schema.skills = new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: true }),
        stat: new fields.StringField({ required: true, blank: true }),
        trained: new fields.BooleanField(),
      })
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
