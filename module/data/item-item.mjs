import NoQuarterItemBase from './base-item.mjs';

export default class NoQuarterItem extends NoQuarterItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.quantity = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });
    schema.weight = new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
    schema.formula = new fields.StringField({ blank: true, initial: '' });

    return schema;
  }
}
