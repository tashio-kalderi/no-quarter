import NoQuarterItemBase from './base-item.mjs';
import { NOQUARTER } from '../helpers/config.mjs';
import { abilityChances } from '../helpers/success.mjs';

export default class NoQuarterAbility extends NoQuarterItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // The stat the ability is based on. Blank for passive abilities, which
    // have no stat and no success chance.
    schema.stat = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.stats)],
      initial: '',
    });
    // Rank and stamina cost can be left empty; empty counts as 0.
    schema.rank = new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 0,
      max: NOQUARTER.successRules.maxRank,
    });
    schema.staminaCost = new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 0,
    });
    schema.effect = new fields.StringField({ required: true, blank: true });
    // The damage dealt, used by the basic abilities (base 1).
    schema.damage = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });
    // Monster abilities only: the kind of damage, the range (such as "30 ft."),
    // and how many times the ability can be used in one combat (empty for
    // unlimited).
    schema.damageType = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.damageTypes)],
      initial: '',
    });
    schema.range = new fields.StringField({ required: true, blank: true });
    schema.uses = new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 1,
    });
    // How many times the ability has been used this combat, which is stored
    // instead of the uses left so that changing the maximum keeps working; see
    // `remaining` and NoQuarterActor#resetAbilityUses.
    schema.used = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    // Set on the abilities every character starts with (see config.mjs).
    schema.basicKey = new fields.StringField({ required: true, blank: true, initial: '' });

    return schema;
  }

  /** Uses left this combat, counting down from `uses`; null when unlimited. */
  prepareDerivedData() {
    this.remaining = this.uses ? Math.max(0, this.uses - this.used) : null;
  }

  /**
   * The Regular/Greater/Extreme success chances. A monster's abilities all use
   * the monster's own chances. A character's are based on their rank in the
   * ability's stat, and are null for passive abilities (no stat).
   */
  get chances() {
    const actor = this.parent?.actor;
    if (actor?.type === 'npc') return actor.system.chances;
    if (!this.stat) return null;
    const statRank = this.parent?.actor?.system.stats?.[this.stat]?.value ?? 0;
    return abilityChances(statRank, this.rank ?? 0);
  }
}
