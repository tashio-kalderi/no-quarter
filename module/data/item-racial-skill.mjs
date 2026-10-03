import NoQuarterItemBase from './base-item.mjs';
import { NOQUARTER } from '../helpers/config.mjs';

/**
 * A racial skill, dragged onto a character from the compendium. Stat increases
 * and other character creation bonuses are written in the description and
 * allocated by hand for now; the bonuses below are applied automatically
 * while the character has the skill (see NoQuarterCharacter#prepareBonuses).
 */
export default class NoQuarterRacialSkill extends NoQuarterItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Added to the character's maximum Health and Stamina, and to their Speed.
    schema.health = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.stamina = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 0 });
    // A form of vision the skill grants, if any (see NOQUARTER.visionTypes).
    schema.vision = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.visionTypes)],
      initial: '',
    });
    // Whether a character can have this skill more than once (such as Faster
    // Movement), and whether it rules out every other racial skill (Flight).
    schema.repeatable = new fields.BooleanField();
    schema.exclusive = new fields.BooleanField();
    // Something the player picks when the skill is dropped onto a character,
    // such as which stat a Stat Increase is for, and what they picked. Taken
    // more than once, each copy must pick something different.
    schema.choice = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.racialSkillChoices)],
      initial: '',
    });
    schema.stat = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.stats)],
      initial: '',
    });

    return schema;
  }
}
