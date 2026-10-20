import NoQuarterItemBase from './base-item.mjs';
import { NOQUARTER } from '../helpers/config.mjs';
import { abilityChances } from '../helpers/success.mjs';
import { statusList } from '../helpers/damage.mjs';

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
    // The basic attacks the ability works with, such as a supplemental
    // ability that can only be added onto a melee attack. Empty for none.
    schema.basicAttacks = new fields.SetField(
      new fields.StringField({ required: true, blank: false, choices: Object.keys(NOQUARTER.basicAttacks) })
    );
    // The number in the effect that grows with rank: `base` at the ability's
    // minimum rank, plus `step` every rank or every other rank (ranks 3 and 5
    // when it starts at 1), or always `base` when fixed. An empty base means
    // the effect has no such number.
    schema.scaling = new fields.SchemaField({
      base: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
      step: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      mode: new fields.StringField({ required: true, choices: Object.keys(NOQUARTER.scalingModes), initial: 'perRank' }),
    });
    // An ability such as Impose Condition asks which condition it imposes when
    // a character takes it, and can be taken once for each condition.
    schema.conditionChoice = new fields.BooleanField();
    schema.condition = new fields.StringField({ required: true, blank: true, initial: '' });
    // What's done with the scaling value automatically; see NOQUARTER.abilityAutomations.
    schema.automation = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.abilityAutomations)],
      initial: '',
    });
    // How often a supplemental ability can be added onto attacks; see NOQUARTER.attackLimits.
    schema.attackLimit = new fields.StringField({
      required: true,
      blank: true,
      choices: ['', ...Object.keys(NOQUARTER.attackLimits)],
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
    // A Special supplemental ability: a character can have several, but only
    // one can be added onto the same attack. Only used on supplemental abilities.
    schema.special = new fields.BooleanField();
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
   * if it were the lower one. Below the ability's minimum rank there is no
   * lower rank to use, so it is 0 and the ability is disabled (see `disabled`).
   * @type {number}
   */
  get effectiveRank() {
    const rank = this.rank ?? 0;
    const cap = this.highestStat?.value;
    if (cap === undefined) return rank;
    const effective = Math.min(rank, cap);
    return effective < (this.minRank ?? 1) ? 0 : effective;
  }

  /**
   * Whether a taken ability can't be used because its highest tied stat is
   * below the ability's minimum rank, such as Counterattack (rank 3 and up)
   * with its stat lowered to 2, or any ability with its stat at 0. It keeps its
   * rank and works again once the stat is back up.
   * @type {boolean}
   */
  get disabled() {
    return this.parent?.actor?.type === 'character' && (this.rank ?? 0) >= 1 && this.effectiveRank < 1;
  }

  /**
   * The ability's scaling value at its effective rank, or null when it has
   * none or hasn't been taken (rank 0).
   * @type {number|null}
   */
  get scaledValue() {
    const { base, step, mode } = this.scaling;
    const rank = this.effectiveRank;
    if (base === null || rank < 1) return null;
    if (mode === 'fixed') return base;
    const above = Math.max(0, rank - this.minRank);
    const steps = mode === 'everyOtherRank' ? Math.floor(above / 2) : above;
    return base + step * steps;
  }

  /**
   * The scaling value as shown, such as "+3" for a damage bonus.
   * @type {string}
   */
  get scaledLabel() {
    const value = this.scaledValue;
    if (value === null) return '';
    return this.automation && value >= 0 ? `+${value}` : String(value);
  }

  /**
   * The effect as posted to chat, with the scaling value for the current rank,
   * such as "... per rank. (Currently +3)".
   * @type {string}
   */
  get effectNote() {
    const scaled = this.scaledLabel;
    const current = scaled && `(${game.i18n.format('NOQUARTER.Scaling.current', { value: scaled })})`;
    return [this.effect, current].filter(Boolean).join(' ');
  }

  /**
   * A basic attack's damage bonuses from the character's abilities that add
   * to its damage, such as Increase Damage (Melee).
   * @type {{name: string, value: number}[]}
   */
  get damageBonuses() {
    const actor = this.parent?.actor;
    if (!this.basicKey || !actor) return [];
    return actor.items
      .filter((i) => i.type === 'ability' && i.system.automation === 'damage' && i.system.basicAttacks.has(this.basicKey))
      .map((i) => ({ name: i.name, value: i.system.scaledValue ?? 0 }))
      .filter((b) => b.value);
  }

  /**
   * The sum of a basic attack's damage bonuses.
   * @type {number}
   */
  get damageBonus() {
    return this.damageBonuses.reduce((sum, b) => sum + b.value, 0);
  }

  /**
   * A basic attack's damage with its bonuses added.
   * @type {number|null}
   */
  get totalDamage() {
    const bonus = this.damageBonus;
    if (this.damage === null && !bonus) return null;
    return (this.damage ?? 0) + bonus;
  }

  /**
   * The tooltip on a basic attack's damage box when abilities add to it, such
   * as "Base 1, Increase Damage (Melee) +2".
   * @type {string}
   */
  get damageTooltip() {
    const bonuses = this.damageBonuses;
    if (!bonuses.length) return '';
    const esc = foundry.utils.escapeHTML;
    const lines = bonuses.map((b) => `${esc(b.name)} +${b.value}`);
    return [game.i18n.format('NOQUARTER.Automation.DamageBase', { base: this.damage ?? 0 }), ...lines].join('<br>');
  }

  /**
   * The chosen condition's name, or '' when there is none.
   * @type {string}
   */
  get conditionLabel() {
    if (!this.condition) return '';
    const status = statusList().find((s) => s.id === this.condition);
    return status ? game.i18n.localize(status.name) : this.condition;
  }

  /**
   * The conditions a supplemental ability with the "condition" automation
   * inflicts on a hit: its condition, with its scaling value as the stacks
   * when the condition stacks (1 when it has no scaling value).
   * @type {{id: string, formula: string|null}[]}
   */
  get attackConditions() {
    if (this.automation !== 'condition' || !this.condition) return [];
    const stackable = !!statusList().find((s) => s.id === this.condition)?.stackable;
    return [{ id: this.condition, formula: stackable ? String(Math.max(1, this.scaledValue ?? 1)) : null }];
  }

  /**
   * How many attacks a turn a "perTurn" ability can be added onto: its scaling
   * value, at least 1.
   * @type {number}
   */
  get usesPerTurn() {
    return Math.max(1, this.scaledValue ?? 1);
  }

  /** Whether this is a Special supplemental ability (see `special`). */
  get isSpecial() {
    return this.actionType === 'supplemental' && this.special;
  }

  /**
   * The ability's type as shown: "Basic" for the basic attacks, "Special" for
   * a Special supplemental ability, otherwise its action type.
   * @type {string}
   */
  get typeLabel() {
    if (this.basicKey) return game.i18n.localize('NOQUARTER.ActionType.basic.label');
    if (this.isSpecial) return game.i18n.localize('NOQUARTER.ActionType.special.label');
    return game.i18n.localize(NOQUARTER.actionTypes[this.actionType]?.label ?? 'NOQUARTER.Passive');
  }

  /** Whether the ability's rank is above its highest tied stat (or disabled by it). */
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
    if (this.actionType !== 'full' || !this.stats.size || this.disabled) return null;
    return abilityChances(this.highestStat?.value ?? 0, this.effectiveRank);
  }
}
