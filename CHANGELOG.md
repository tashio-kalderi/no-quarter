# CHANGELOG

## Unreleased

- Conditions that stack (Bleeding, Blind, Poisoned, Blessed) now show their stack count on the token itself, not just in the Token HUD: a red circle in the corner of the condition's icon, the same as the one in the HUD. It shows from 1 stack up. Conditions that don't stack have no counter.

## 0.3.2

- Monster sheet: the Damage/Effect column is split into Attacks, Damage and Effect. Attacks is how many attack rolls one use of the ability makes (default 1); a limited-use ability uses up one use for all of them, not one per roll. Damage is dealt by each attack that hits, plus 1 for a Greater success, 2 for Extreme and 5 for a critical success, like the basic attacks. Leave Damage empty for an ability that only has an effect. All the attacks go in one chat card, numbered, with the effect shown once underneath. The roll mode is asked once, but conditions count each attack as its own roll: each attack uses up a Blessed stack, so with 1 stack only the first attack has advantage (or, against Poisoned or Restrained, only the first is made normally and the rest with disadvantage), and ignoring Burning's penalty costs 1 damage per attack. Monster sheets also open a little wider to fit the new columns.
- Existing monster abilities start with 1 attack and an empty Damage box (the old hidden default of 1 is cleared; any other value is kept); their damage is still written in Effect, so move it across to have it rolled. The first time the GM loads the world, every ability's Attacks and Damage are saved, so a Damage value entered on an older ability no longer disappears on the next load.
- Character sheet: the basic Melee, Ranged and Magic attacks have their own icons. Existing characters' basic attacks switch over the next time their sheet is opened, unless someone already gave them a different picture.
- Character sheet: a Breather button under the portrait. It restores Health and Stamina to full and removes every condition. Wounds stay as they are, and so does Dead, since it follows the wounds. It's greyed out and can't be used while the character is in a combat that has started.
- Cornered Rats Initiative System: once a combat has started, players can only move a token while it's the combatant taking their turn (after Start turn, until Finish or Cancel). Moving any other token, including one left out of the combat, is blocked with a warning. The GM can still move any token. (#5)
- Restrained: now also forces disadvantage on every stat and ability check, like Poisoned. Against Blessed the two cancel out and the roll is made normally. (#4)
- Skills are now a plain list of names on the Skills tab, with no stat, success chances or Trained checkbox, and they aren't rolled. When a skill helps, the GM gives advantage and the player makes a normal stat roll. Skills come from the new Skills folder in the SRD compendium (drag them onto the sheet), or can be added with the + button and named directly in the list. A character can't have the same skill twice. Each skill has a sheet with a description.
- Existing characters are converted when the GM loads the world: basic skills they were trained in, and skills they had added themselves, become skills in the new list (linked to the compendium entry where there is one). Untrained basic skills are dropped, since the list now only holds the skills a character actually has.
- Racial skills: a new item type, dragged onto a character from the compendium. Dropping one anywhere on the sheet adds it to a new Racial Skills section at the top of the Skills tab, above Profession. A character can have up to 3; monsters can't have them. A skill can only be taken twice if it's marked as repeatable (such as Faster Movement or Health), and one marked as excluding all others (Flight) can't be taken alongside any other racial skill. Each row shows a summary of what the skill gives.
- Stat Increase: dropping it onto a character opens a box to pick which stat it's for, and the stat is shown next to its name, such as "Stat Increase (Might)". Stats the character already picked for another Stat Increase aren't offered. The stat can be changed later on the skill's sheet. It only records the choice; the stat itself is still raised by hand. Any racial skill can be set up this way with its "Choose on drop" option.
- A racial skill can add to maximum Health, maximum Stamina and Speed, and grant Darkvision, Earthsense or Echolocation (60 ft.). These apply automatically while the character has the skill and go away when it's removed. Stat increases and other character creation bonuses go in its description and are still allocated by hand.
- Character sheet: the Speed box now shows Speed including racial skill bonuses (hover for the breakdown). Editing it changes the base Speed. Health and Stamina maximums show a tooltip when a racial skill adds to them.
- Vision from racial skills is applied to the character's tokens without changing their saved settings, so removing the skill returns the tokens to their own vision. Darkvision gives the darkvision look and sight out to 60 ft. (a token that already sees further keeps its range). Earthsense uses Foundry's tremorsense, which can't detect flying or hovering creatures. Echolocation is a new detection mode: it works in the dark, is blocked by walls, and can detect flying creatures.
- New No Quarter (SRD) compendium folder, with a Characters pack and a Monsters pack. The Characters pack has an Items folder and a Character Features folder, with Racial Skills inside it.
- The Skills folder has the 23 skills with their descriptions, sorted into Might, Agility, Mind and Personality Skills. Intimidation has a Might and a Personality version.
- The Racial Skills folder has the 14 racial skills, sorted into Sensory, Movement, Stats and Abilities, and Miscellaneous. Darkvision, Earthsense, Echolocate, Faster Movement, Health and Stamina apply their effects automatically; the rest (such as Swimming, Pounce or Stat Increase) are described in their text and applied by hand for now. The Monsters pack is still empty.

## 0.3.1

- Actor sheet: tabbing or clicking from one ability box to the next (or between a character's own skills) no longer drops focus out of the box, so there's no need to click back into it. The cursor also stays where it was. (#3)
- Wound counter on tokens: now always sized to the token, so on scenes with a small grid (under 50 pixels per square) it no longer covers a large part of the token. (#2)

## 0.3.0

- Character sheet: the Description tab is replaced by a Skills tab. Monsters keep their Description tab.
- Skills tab: a Profession section across the top, with a short box for the profession's name and a longer one for a brief description.
- Every character has the basic skills, grouped by stat and sorted by name: Might and Mind in the left column, Agility and Personality in the right. Intimidation appears twice on purpose, once under Might and once under Personality. Each skill has a Trained checkbox and shows its stat's Reg/Great/Ext success chances.
- Each stat's heading has a + button to add a skill of the character's own under that stat, with an editable name and a delete button.
- Clicking a skill's success chances rolls its stat under the skill's name. A trained skill is rolled with advantage; a source of disadvantage (such as Poisoned, or a situational one by choosing Normal) cancels it out and the roll is made normally. Blessed isn't used up on a trained skill's roll, since it already has advantage.

## 0.2.4

- Actor and item sheets rebuilt on Foundry's ApplicationV2 framework, replacing the old sheet framework that Foundry is phasing out. They look and work as before, except that they always use the light theme. Also clears the "deprecated global" warnings from the console.
- Effects tab: effect icons show again. They had been blank since Foundry renamed the icon field.
- Posting a passive ability (or an item with no roll formula) to chat now follows the chosen roll mode, such as GM or private roll. Before, these cards were always public.

## 0.2.3

- Cornered Rats Initiative System: the GM can no longer start a combatant's turn when it isn't their side's turn, so monsters can't go during the players' turn (and vice versa). To fix a mistake, the GM hands the turn to the other side first. (#1)
- Restrained: an on/off condition that sets the creature's Speed to 0 while active. The Speed box on the sheet shows 0 and is locked; the normal Speed comes back when the condition is removed. Any movement on a Restrained combatant's turn shows red on the movement ruler.
- Monsters now have a Speed (default 30), shown in the stat block between MDR and Stats. The movement ruler colors monster movement against it too.
- Blessed: a stacking condition that grants advantage on the next roll, with no opting out. It doesn't count down at the end of a turn; instead it loses one stack each time it's applied to a roll. Against a condition that forces disadvantage (such as Poisoned) the two cancel out and the roll is made normally, still using up one Blessed stack.

## 0.2.2

- Character sheet: Health, Stamina and Wounds moved out of the header to a new Vitals list next to Stats, alongside a new Speed field. The header now has Race, Gender and Alignment text fields where those used to sit.
- Movement ruler: while it's a combatant's active turn, their token's movement line and grid highlight are colored green up to their Speed, yellow up to double Speed, and red beyond that. Starting a turn resets the token's movement history so the coloring reflects only that turn's movement.
- Canceling a turn now puts the token back where it stood when the turn started, undoing any movement made during it.
- The Reg/Great/Ext success chances (Stats and Abilities) are now read-only boxes styled like the Health/Stamina max field, with the header labels lined up against the boxes below them.

## 0.2.1

- Condition markers are now stackable. In the Token HUD, left-click a status effect to add a stack (creating it if it isn't already active); right-click removes one, clearing the condition once it reaches 0. The current count shows as a badge on the icon.
- Bleeding: deals damage equal to its stack count at the start of the bleeding character's turn, and loses one stack at the end of it. Canceling a turn (or having it interrupted, e.g. by combat moving on) undoes any health and wounds change it caused.
- Blind: a duration in turns rather than a severity, losing one stack at the end of each turn. Gives a -10 success penalty to stat and ability checks; the roll dialog shows a checkbox (checked by default) so a check that doesn't rely on sight can opt out.
- Poisoned: a duration in turns like Blind. Forces every stat and ability check to be made with disadvantage while it's active, with no opting out.
- Burning: an on/off condition that lasts until healed or cured (not yet implemented). Gives a flat -25 success penalty to checks; the roll dialog lets you decline that penalty instead, at the cost of 1 damage.

## 0.2.0

- Turn order: there is no initiative roll any more. When the combat begins the GM declares which side attacks first, and the sides then alternate turns; there are no rounds. The side that is up chooses who goes, and a combatant cannot go again until everyone else on their side has gone, at which point that side unlocks. Character actors are always on the players' side, and monsters are on the monsters' side unless their token is friendly (an ally).
- Combat tracker: combatants are grouped by side. Players start, end or cancel their own turn; the GM can do this for anyone, mark a combatant as done, let one go again, and give the turn to either side.

## 0.1.1

- Clicking a stat or ability now asks whether the roll is Normal, with Advantage, or with Disadvantage. Advantage rolls twice and keeps the lower result; disadvantage rolls twice and keeps the higher. Wounds apply to both rolls.
- Monster abilities: uses count down per combat and reset when the combat ends; the range gets " ft." added when a bare number is typed; the chat card shows the damage type and range after the name and the damage/effect under the roll.
- Monster sheet: the Health, PDR, MDR and Stats line is its own block above the abilities; the 100 cap on the Stats chances is gone; XP was removed.

## 0.1

- First public version: characters with stats and abilities, and monsters with a single-stat stat block (level, alignment, creature type, health, PDR/MDR, and abilities with a damage type, range, and uses per combat).
