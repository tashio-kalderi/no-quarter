import NoQuarterItemBase from './base-item.mjs';
import { NOQUARTER } from '../helpers/config.mjs';
import { abilityChances } from '../helpers/success.mjs';

export default class NoQuarterAbility extends NoQuarterItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // How the ability is used: a full action takes the character's turn and is
    // rolled; a supplemental ability is added onto a full action, and a passive
    // one is always on. Neither of those is rolled.
    schema.actionType = new fields.StringField({
      required: true,
      choices: Object.keys(NOQUARTER.actionTypes),
      initial: 'full',
    });
    // The stats the ability is tied to. Its rank can't go above the highest of
    // them, and a full action rolls with the highest.
    schema.stats = new fields.SetField(
      new fields.StringField({ required: true, blank: false, choices: Object.keys(NOQUARTER.stats) })
    );
    // Rank and stamina cost can be left empty; empty counts as 0.
    schema.rank = new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 0,
      max: NOQUARTER.successRules.maxRank,
    });
    // The lowest and highest rank a character can have the ability at. Taking
    // it costs its minimum rank in ability points; rank 0 means not taken yet.
    schema.minRank = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 1,
      max: NOQUARTER.successRules.maxRank,
    });
    schema.maxRank = new fields.NumberField({
      ...requiredInteger,
      initial: NOQUARTER.successRules.maxRank,
      min: 1,
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
    // The damage dealt on a hit, before the bonus for a Greater or better
    // success. The basic abilities start at 1; a monster ability can leave it
    // empty when it only has an effect.
    schema.damage = new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 0,
    });
    // Monster abilities only: how many attack rolls one use of the ability makes.
    schema.attacks = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });
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

  /** @override */
  static migrateData(source, options) {
    // Before attacks were added, damage was always stored as 1 but only the
    // basic abilities used it. Clear that leftover 1 on the others so a monster
    // ability doesn't suddenly deal 1 damage; its damage was written in its
    // effect. Any other value was entered since, so it's kept. Foundry only
    // saves changed fields, so `attacks` can stay missing after an edit until
    // migrateAbilityAttacks (helpers/migrations.mjs) saves it.
    // Abilities used to have a single stat, and no stat meant a passive one.
    if (!options?.partial && source.stats === undefined && source.stat !== undefined) {
      source.stats = source.stat ? [source.stat] : [];
      source.actionType ??= source.stat ? 'full' : 'passive';
    }
    if (!options?.partial && source.attacks === undefined && !source.basicKey && source.damage === 1) {
      source.damage = null;
    }
    return super.migrateData(source, options);
  }

  /** Uses left this combat, counting down from `uses`; null when unlimited. */
  prepareDerivedData() {
    this.remaining = this.uses ? Math.max(0, this.uses - this.used) : null;
  }

  /**
   * The tied stat with the highest rank on the owning character, counting any
   * effects on it, or null when the ability has no stats or no character.
   * @type {{key: string, value: number}|null}
   */
  get highestStat() {
    const stats = this.parent?.actor?.system.stats;
    if (!stats) return null;
    let best = null;
    for (const key of this.stats) {
      const value = stats[key]?.value ?? 0;
      if (!best || value > best.value) best = { key, value };
    }
    return best;
  }

  /**
   * The rank the ability is used at. It can't go above the highest tied stat,
   * so if an effect lowers that stat the ability keeps its rank but works as
   * if it were the lower one.
   * @type {number}
   */
  get effectiveRank() {
    const rank = this.rank ?? 0;
    const cap = this.highestStat?.value;
    return cap === undefined ? rank : Math.min(rank, cap);
  }

  /** Whether the ability's rank is above its highest tied stat. */
  get rankCapped() {
    return (this.rank ?? 0) > this.effectiveRank;
  }

  /**
   * The Regular/Greater/Extreme success chances. A monster's abilities all use
   * the monster's own chances. A character's full actions use the highest tied
   * stat and the ability's effective rank; other abilities aren't rolled, so
   * they have none.
   */
  get chances() {
    const actor = this.parent?.actor;
    if (actor?.type === 'npc') return actor.system.chances;
    if (this.actionType !== 'full' || !this.stats.size) return null;
    return abilityChances(this.highestStat?.value ?? 0, this.effectiveRank);
  }
}
