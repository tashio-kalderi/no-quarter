import { askRollMode, attackRolls, rollSuccess } from '../helpers/success.mjs';
import { applyRollPenalty, applyRollCosts } from '../helpers/conditions.mjs';
import { basicDamageType, parseConditions } from '../helpers/damage.mjs';
import { formatRange } from '../helpers/range.mjs';
import { checkItemCreate, checkItemDelete, checkItemUpdate } from '../helpers/build-mode.mjs';
import { rankableAbilities } from '../helpers/racial-skills.mjs';
import { racialSkillChoice } from '../helpers/progression.mjs';
import { attackWithBox } from '../helpers/attack-builder.mjs';

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class NoQuarterItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * A player can only add abilities, skills and racial skills to a character
   * in build mode, with the points to spare, and can't give an ability a rank
   * above its highest stat (see helpers/build-mode.mjs).
   * @override
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (!checkItemCreate(this, options, user)) return false;
    if (!this.#allowedRank(this.system.rank, this.system.stats, user)) return false;
    if (!this.#rankInRange(this.system.rank, this.system.minRank, this.system.maxRank, user)) return false;
    if (!(await this.#chooseCondition(user))) return false;
  }

  /**
   * An ability such as Impose Condition asks which condition it imposes when a
   * character takes it, and is renamed after it, as in "Impose Condition
   * (Bleeding)". Each copy must be for a different condition.
   * @param {User} user
   * @returns {Promise<boolean>}   False if no condition was chosen
   */
  async #chooseCondition(user) {
    const system = this.system;
    if (this.type !== 'ability' || !system.conditionChoice || system.condition) return true;
    if (this.actor?.type !== 'character' || user.id !== game.user.id) return true;
    const prefix = `${this.name} (`;
    const taken = new Set(
      this.actor.items
        .filter((i) => i.type === 'ability' && i.system.conditionChoice && i.name.startsWith(prefix))
        .map((i) => i.system.condition)
    );
    const esc = foundry.utils.escapeHTML;
    const options = statusList()
      .filter((s) => s.id && s.id !== 'dead' && !taken.has(s.id))
      .map((s) => ({ id: s.id, name: game.i18n.localize(s.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`);
    if (!options.length) {
      ui.notifications.warn(game.i18n.format('NOQUARTER.ImposeCondition.AllChosen', { name: this.name }));
      return false;
    }
    const condition = await foundry.applications.api.DialogV2.prompt({
      window: { title: this.name, icon: 'fa-solid fa-person-falling-burst' },
      content: `<p>${game.i18n.format('NOQUARTER.ImposeCondition.Choose', { name: esc(this.name) })}</p>
        <select name="condition" autofocus>${options.join('')}</select>`,
      ok: { label: 'NOQUARTER.RacialSkill.Choose', callback: (event, button) => button.form.elements.condition.value },
      rejectClose: false,
    });
    if (!condition) return false;
    const label = game.i18n.localize(statusList().find((s) => s.id === condition)?.name ?? condition);
    this.updateSource({ name: `${this.name} (${label})`, 'system.condition': condition });
    return true;
  }

  /**
   * A range typed as a bare number, such as "60", becomes "60 ft.". A player
   * can't raise a character's ability above its highest stat, nor untie it
   * from the stat that allows its rank.
   * @override
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    if (!checkItemUpdate(this, changes, user)) return false;

    // A Stat Increase moved to another stat takes its rank with it (see _onUpdate).
    const stat = foundry.utils.getProperty(changes, 'system.stat');
    if (
      this.type === 'racialSkill' &&
      this.system.choice === 'stat' &&
      this.actor?.type === 'character' &&
      stat !== undefined &&
      stat !== this.system.stat
    ) {
      // A player can only move it while building, and not onto a stat already at the cap.
      if (!user.isGM) {
        const actor = this.actor;
        if (!actor.system.building) {
          ui.notifications.warn('NOQUARTER.Build.NotBuilding', { localize: true });
          return false;
        }
        const { statCap, level } = actor.system.progression;
        if (stat && (actor._source.system.stats[stat]?.value ?? 0) >= statCap) {
          ui.notifications.warn(
            game.i18n.format('NOQUARTER.Build.StatCap', {
              stat: game.i18n.localize(CONFIG.NOQUARTER.stats[stat]),
              cap: statCap,
              level,
            })
          );
          return false;
        }
      }
      options.noQuarterStatMoved = { from: this.system.stat, to: stat };
    }

    // An Ability racial skill pointed at another ability takes its rank with it (see _onUpdate).
    const abilityId = foundry.utils.getProperty(changes, 'system.abilityId');
    if (
      this.type === 'racialSkill' &&
      this.actor?.type === 'character' &&
      abilityId !== undefined &&
      abilityId !== this.system.abilityId
    ) {
      if (!user.isGM && !this.actor.system.building) {
        ui.notifications.warn('NOQUARTER.Build.NotBuilding', { localize: true });
        return false;
      }
      const target = abilityId ? this.actor.items.get(abilityId) : null;
      if (abilityId && !rankableAbilities(this.actor, this).includes(target)) {
        ui.notifications.warn(game.i18n.format('NOQUARTER.RacialSkill.AbilityNotAllowed', { name: target?.name ?? '' }));
        return false;
      }
      foundry.utils.setProperty(changes, 'system.ability', target?.name ?? '');
      // Copies taken before the racial skill had its choice get it now.
      if (!this.system.choice) foundry.utils.setProperty(changes, 'system.choice', racialSkillChoice(this));
      options.noQuarterAbilityMoved = { from: this.system.linkedAbility?.id ?? null, to: target?.id ?? null };
    }

    const rank = foundry.utils.getProperty(changes, 'system.rank');
    const stats = foundry.utils.getProperty(changes, 'system.stats');
    if (rank !== undefined || stats !== undefined) {
      const newRank = rank !== undefined ? rank : this.system.rank;
      const previous = { rank: this.system.rank, stats: this.system.stats };
      if (!this.#allowedRank(newRank, stats ?? this.system.stats, user, previous)) return false;
    }
    const minRank = foundry.utils.getProperty(changes, 'system.minRank');
    const maxRank = foundry.utils.getProperty(changes, 'system.maxRank');
    const rangeChanged =
      (rank !== undefined && rank !== this.system.rank) ||
      (minRank !== undefined && minRank !== this.system.minRank) ||
      (maxRank !== undefined && maxRank !== this.system.maxRank);
    if (rangeChanged) {
      const newRank = rank !== undefined ? rank : this.system.rank;
      if (!this.#rankInRange(newRank, minRank ?? this.system.minRank, maxRank ?? this.system.maxRank, user)) {
        return false;
      }
    }

    const range = foundry.utils.getProperty(changes, 'system.range');
    if (typeof range === 'string') foundry.utils.setProperty(changes, 'system.range', formatRange(range));

    // An emptied attacks box goes back to a single attack.
    const attacks = foundry.utils.getProperty(changes, 'system.attacks');
    if (attacks !== undefined && !(attacks >= 1)) foundry.utils.setProperty(changes, 'system.attacks', 1);
  }

  /**
   * Move a racial skill's rank when what it's for changes: a Stat Increase's
   * stat, or an Ability racial skill's ability.
   * @override
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id || !this.actor) return;
    if (options.noQuarterAbilityMoved) this.#moveAbilityRank(options.noQuarterAbilityMoved);
    const moved = options.noQuarterStatMoved;
    if (!moved) return;
    const stats = this.actor._source.system.stats;
    const changes = {};
    if (moved.from) changes[`system.stats.${moved.from}.value`] = Math.max(0, (stats[moved.from]?.value ?? 0) - 1);
    if (moved.to) changes[`system.stats.${moved.to}.value`] = (stats[moved.to]?.value ?? 0) + 1;
    this.actor.update(changes, { noQuarterRacialStat: true });
  }

  /**
   * Take a rank off the ability an Ability racial skill was for, then give one
   * to the ability it's for now. Taking it off first frees the point.
   * @param {{from: string|null, to: string|null}} moved   Ability ids
   */
  async #moveAbilityRank({ from, to }) {
    const items = this.actor.items;
    const old = from ? items.get(from) : null;
    if (old) {
      const rank = Math.max(0, (old.system.rank ?? 0) - 1);
      await old.update({ 'system.rank': rank < old.system.minRank ? 0 : rank });
    }
    const target = to ? items.get(to) : null;
    if (target) await target.update({ 'system.rank': (target.system.rank ?? 0) + 1 });
  }

  /**
   * A player can only remove a character's abilities, skills and racial
   * skills in build mode (see helpers/build-mode.mjs).
   * @override
   */
  async _preDelete(options, user) {
    const allowed = await super._preDelete(options, user);
    if (allowed === false) return false;
    if (!checkItemDelete(this, user)) return false;
  }

  /**
   * Whether a rank is allowed for this item when it's a character's ability.
   * The cap is the highest of its stats as the player allocated them, so a
   * temporary bonus from an effect doesn't count. GMs can set any rank. When
   * a GM has already set it higher, a player's other edits still save as long
   * as they don't raise the rank or lower the cap further. Warns the player
   * when it isn't allowed.
   * @param {number|null} rank
   * @param {Iterable<string>} stats
   * @param {User} user
   * @param {{rank: number|null, stats: Iterable<string>}} [previous]   The values before an update
   * @returns {boolean}
   */
  #allowedRank(rank, stats, user, previous) {
    if (this.type !== 'ability' || this.actor?.type !== 'character' || user.isGM) return true;
    const best = this.#highestBaseStat(stats);
    // Without a stat there's nothing to cap it by yet; tying it to one is checked.
    if (!best || (rank ?? 0) <= best.value) return true;
    if (previous) {
      const before = this.#highestBaseStat(previous.stats);
      if ((rank ?? 0) <= (previous.rank ?? 0) && before && best.value >= before.value) return true;
    }
    ui.notifications.warn(
      game.i18n.format('NOQUARTER.AbilityRank.TooHigh', {
        name: this.name,
        rank,
        stat: game.i18n.localize(CONFIG.NOQUARTER.stats[best.key]),
        value: best.value,
      })
    );
    return false;
  }

  /**
   * Whether a rank is within a character's ability's range: 0 (not taken) or
   * from its minimum to its maximum rank. GMs can set any rank. Warns the
   * player when it isn't allowed.
   * @param {number|null} rank
   * @param {number} min
   * @param {number} max
   * @param {User} user
   * @returns {boolean}
   */
  #rankInRange(rank, min, max, user) {
    if (this.type !== 'ability' || this.actor?.type !== 'character' || user.isGM) return true;
    rank = rank ?? 0;
    if (rank === 0 || (rank >= min && rank <= max)) return true;
    ui.notifications.warn(game.i18n.format('NOQUARTER.AbilityRank.OutOfRange', { name: this.name, min, max }));
    return false;
  }

  /**
   * The highest of some stats as the owning character allocated them.
   * @param {Iterable<string>} stats
   * @returns {{key: string, value: number}|null}
   */
  #highestBaseStat(stats) {
    const base = this.actor._source.system.stats;
    let best = null;
    for (const key of stats ?? []) {
      const value = base[key]?.value ?? 0;
      if (!best || value > best.value) best = { key, value };
    }
    return best;
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Abilities roll d100 against their success chances.
    if (item.type === 'ability') {
      // Only full actions are rolled; post the others to chat instead.
      if (!item.system.chances) {
        const esc = foundry.utils.escapeHTML;
        const typeLabel = item.system.typeLabel;
        const effectText = item.system.effectNote;
        const effect = effectText ? `<div class="roll-effect">${esc(effectText)}</div>` : '';
        return ChatMessage.create(
          {
            speaker: ChatMessage.getSpeaker({ actor: item.actor }),
            content: `<div class="no-quarter-roll">
              <div class="roll-title"><strong>${esc(item.name)}</strong> <span class="roll-chances">(${esc(typeLabel)})</span></div>
              ${effect}
            </div>`,
          },
          { messageMode: game.settings.get('core', 'messageMode') }
        );
      }
      // A character's basic attack first asks which supplemental abilities go on it.
      if (item.system.basicKey && item.actor?.type === 'character') return attackWithBox(item);

      const isMonster = item.actor?.type === 'npc';

      // A monster ability with limited uses can only be used that many times
      // per combat. Each use makes all of its attacks.
      const { uses, used } = item.system;
      const limited = isMonster && uses;
      if (limited && used >= uses) {
        return ui.notifications.warn(
          game.i18n.format('NOQUARTER.NoUsesLeft', { name: item.name })
        );
      }

      // A monster ability shows its damage type and range after the name (the
      // stat block has the chances). Every ability shows its effect under the roll.
      const typeKey = CONFIG.NOQUARTER.damageTypes[item.system.damageType];
      const tag = isMonster
        ? [typeKey ? game.i18n.localize(typeKey) : '', item.system.range].filter(Boolean).join(', ')
        : undefined;
      const note = item.system.effectNote || undefined;

      // Ask how the roll is made; closing the dialog cancels it without using up a use.
      const asked = await askRollMode({
        label: item.name,
        chances: item.system.chances,
        tag,
        actor: item.actor,
        ability: true,
      });
      if (!asked) return;
      if (limited) await item.update({ 'system.used': used + 1 });
      // Each attack counts as its own roll for the conditions' costs.
      const attacks = attackRolls(item.actor, asked, isMonster ? item.system.attacks : 1);
      await applyRollCosts(item.actor, attacks);

      return rollSuccess({
        actor: item.actor,
        note,
        tag,
        modes: attacks.modes,
        label: item.name,
        chances: applyRollPenalty(item.system.chances, asked.penalty),
        // A character's own abilities have no damage value, only the basic
        // ones, which add the bonuses from abilities such as Increase Damage.
        damage: isMonster ? item.system.damage : item.system.basicKey ? item.system.totalDamage : undefined,
        damageType: isMonster ? item.system.damageType : basicDamageType(item.system.basicKey),
        // Conditions are read from a monster ability's effect text, such as "Poisoned for 1d4 turns".
        conditions: isMonster ? parseConditions(item.system.effect) : [],
      });
    }

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create(
        {
          speaker: speaker,
          flavor: label,
          content: item.system.description ?? '',
        },
        { messageMode: game.settings.get('core', 'messageMode') }
      );
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      // toMessage applies the user's chosen message mode by default.
      roll.toMessage({
        speaker: speaker,
        flavor: label,
      });
      return roll;
    }
  }
}
