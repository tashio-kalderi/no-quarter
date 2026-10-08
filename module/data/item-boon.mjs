import NoQuarterItemBase from './base-item.mjs';

/**
 * A boon: an extra feature a boss monster gets. A name and a description, and
 * for some, the lowest level of monster it's designed for. Most are applied by
 * hand; one that grants wounds (Wounds) or advantage (Powerhouse) is applied
 * automatically. How many a boss
 * gets depends on its level (see NoQuarterNPC#boonCount).
 */
export default class NoQuarterBoon extends NoQuarterItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Adding the boon to a lower level monster only warns; it isn't blocked.
    schema.minLevel = new fields.NumberField({ required: true, nullable: true, integer: true, min: 1, initial: null });
    // The boss uses the wound rules (see NoQuarterActor#usesWounds).
    schema.grantsWounds = new fields.BooleanField({ required: true, initial: false });
    // The boss makes every d100 check with advantage (see NoQuarterActor#advantageBoons).
    schema.grantsAdvantage = new fields.BooleanField({ required: true, initial: false });

    return schema;
  }
}
