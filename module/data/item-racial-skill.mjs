import NoQuarterItemBase from './base-item.mjs';
import { NOQUARTER } from '../helpers/config.mjs';

/**
 * A racial skill, dragged onto a character from the compendium or picked in
 * the character builder (see helpers/racial-skills.mjs). Stat increases are
 * allocated by hand; the bonuses below are applied automatically
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
    // such as which stat a Stat Increase is for or which skill a Profession
    // adds, and what they picked. Taken more than once, each copy must pick
    // something different.
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
    // The skill it added to the character's skill list: its name when added,
    // and its id, so it's removed along with this racial skill.
    schema.skill = new fields.StringField({ required: true, blank: true, initial: '' });
    schema.skillId = new fields.StringField({ required: true, blank: true, initial: '' });
    // The ability it gave a rank in (the Ability racial skill): its name when
    // picked, and its id, so the rank is taken back along with this racial skill.
    schema.ability = new fields.StringField({ required: true, blank: true, initial: '' });
    schema.abilityId = new fields.StringField({ required: true, blank: true, initial: '' });

    return schema;
  }

  /**
   * The skill this racial skill added, if the character still has it.
   * @type {Item|undefined}
   */
  get linkedSkill() {
    const skill = this.skillId ? this.parent.actor?.items.get(this.skillId) : undefined;
    return skill?.type === 'skill' ? skill : undefined;
  }

  /**
   * The name of the skill it added, as it's called now if it was renamed.
   * @type {string}
   */
  get skillName() {
    return this.linkedSkill?.name ?? this.skill;
  }

  /**
   * The ability this racial skill gave a rank in, if the character still has it.
   * @type {Item|undefined}
   */
  get linkedAbility() {
    const ability = this.abilityId ? this.parent.actor?.items.get(this.abilityId) : undefined;
    return ability?.type === 'ability' ? ability : undefined;
  }

  /**
   * The name of that ability, as it's called now if it was renamed.
   * @type {string}
   */
  get abilityName() {
    return this.linkedAbility?.name ?? this.ability;
  }
}
