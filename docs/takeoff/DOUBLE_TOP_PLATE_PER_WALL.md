# Double top plate per wall (build note)

**Status:** BUILT 18 Nov 2026 on `takeoff/short-plates-6m`, local commit, not pushed.
**Sam, 18 Nov 2026:** "as you're using the select tool in the takeoff, you should just be able to toggle on and off double top plate as you're working around, instead of having to do it before you draw the line."

## What it does
- Each wall can have its own second top plate. Select a wall, tap the **Double top plate** chip. Tap again to remove it. It works before or after drawing.
- **Double top plate walls** (Select, nothing picked) is the many-walls version, the same shape as the wet-area mode: tap each wall. Its chip sets every wall of the item: mixed or off goes all on, all on goes all off. The Select tool picks one wall at a time, so this mode is how several walls are done.
- The item's **Double top plate** box (Line panel, Walls card) is now the **default** for walls with no setting of their own. Change it while some walls have their own and the Line panel asks **Apply to every wall?** Yes clears every wall's own setting. No changes only the walls without one.
- The plan tags a wall with a double top plate **2T** (text, like the wet-area "450 ctrs"). The elevation draws the second plate along the top of the studs, for that wall only. The wall page has the same switch.

## Storage
`inputs.doubleTopPlate` on the wall measurement: `true` or `false`, or absent = follow the item. Setting a wall to what the item already says **deletes** the key, so on then off leaves the inputs exactly as they were (the same rule as the wall's own stud centres). `rules.doubleTopPlate` on the item is unchanged, so an item saved with it ticked still has every wall double.

## Engine
`dispatch.js` (`wall_framing@1`): the plates call adds the `top-2` layer when `wallHasDoubleTop(wall flag, item rules)`. Studs, noggins, junctions and corners are not touched (a Walls wall height is the stud cut, so a second plate never changes it). The wall's layout now also carries `doubleTop`, `doubleTopFrom` ("wall" or "item") and `plateThickMm` for the drawing. The second top plate is a normal plate piece, so it flows into T&B PLATES, the long-plate rule and the short-plate 6 m pool: a 2,400 wall with a double top plate pools three pieces, not two.

## Server
`cleanInputs` in `takeoffService.mjs` keeps `doubleTopPlate` only as a real boolean. Absent or null is dropped. Anything else ("yes", 1, {}) is refused with "Double top plate on a wall is on or off." An older server would drop the field silently, so client and server ship together (as with noHoopIron and the wall centres).

## Calculation version
**Not bumped** (stays `takeoff-calc@9`). No existing record has the new key, so every existing job's counts are identical: the engine reads the item's box for those walls, as before. A bump would mark every draft order line stale for nothing. It is stamped only on exports.

## Also fixed
At 390 px the Line panel's Stud centres box was squeezed to "6 mm" by the fixed 160 px Double top plate label. The row now wraps (Stud centres min 14 rem), so the number always shows.

## Tests
`scripts/tests/takeoff-tc-double-top.test.mjs`, run by `npm run test:takeoff`: per-wall on and off, item default, legacy item-level true, no change for existing data, mixed selection, apply-to-every-wall (Yes and No), short-plate pooling (2,400 wall = 3 pieces), junction and corner walls unaffected, server whitelist.

## Not done (guesses)
- The Select tool has no multi-select, so "select several walls then tap the chip" is the **Double top plate walls** mode instead.
- The "Apply to every wall?" question is on the Line panel box only. The Walls card in Setup (which has no wall list) changes the default and leaves walls with their own setting alone (same as "No").
