# CHANGELOG

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
