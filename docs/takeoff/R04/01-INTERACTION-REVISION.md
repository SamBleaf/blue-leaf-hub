# R04 — simple flashing drawing, explicitly requested by owner

## Desired everyday path

Add flashing → draw the shape → tap dimensions to correct them → tap end for crush fold → choose material/colour/lengths → order review.

The canvas is the main editor. The normal view must not display every possible transform and a second list of every leg.

## Main screen

- Header: Close (navigation), flashing name, Undo (curved back arrow), More.
- Canvas: tappable dimension labels, corners and large invisible hit areas around endpoints. Pinch/pan. A small fit-view action may live under More; desktop zoom shortcuts continue to work.
- One bottom progression action: Details / Lengths (navigation, not Apply/Save).
- The selected item's compact controls appear only when needed. Closing them commits valid edits automatically.
- More contains Redo, Rotate, Mirror, Reverse traversal, Clear drawing and the optional accessible list of dimensions. Keep these available, not permanently displayed.
- Paint/face selection is in the material/details sheet or contextual face control. No left/right traversal lecture occupying canvas space.
- Routine labels: Add flashing, New flashing, Choose flashing, Flashing details. Keep generic method/material naming internally so future timber/cladding is not hard-coded away.

Target: no more than five general actions visible at once when nothing is selected; no duplicated leg chips beneath the same annotated drawing. A context sheet can show its small relevant choice set.

## Crush folds

Do not require drawing a tiny return line or navigating a full end-treatment form.

1. Tap the start/end handle while drawing OR editing.
2. Choose the illustrated 'Crush fold' option. It immediately creates a closed hem with the last-used width for that user (initial10mm UI default, editable).
3. Show the fold on the canvas instantly; tap its width label to change it. A single Flip fold action switches its side with a pictorial preview.

Other end choices: Plain end / Open return. Use 'Crush fold' in the UI and 'Crush fold (closed hem)' in supplier details if helpful. The preview can exaggerate the gap for visibility but must not imply an open return. Include width once in indicative girth. Do not turn an ordinary180° flat included-angle field into a crush: preserve explicit end-treatment topology.

Default side: retain the user's last choice, show it visibly, and allow one-tap flip. Do not claim a universal manufacturing rule that crushes always face the coated/uncoated side.

A crush can be added without first pressing Done drawing. Further drawing from an endpoint that has a crush must either move that terminal treatment to the new terminal endpoint explicitly, or ask the user to remove it before extending; never leave a hidden internal hem.

## Instant edits and undo

- Numeric fields update the drawn geometry as valid values are typed. Persist after a short debounce (around300–500ms) and on blur/selection change. No Apply button and no required Enter.
- Temporary empty/partial/invalid text remains an input draft; preserve last valid geometry. Show a small inline problem. Never coerce empty to0 or save NaN. Do not silently discard an invalid draft when navigating away; preserve it in recovery and keep the flashing incomplete.
- One editing session is one undo command: changing100→1→15→150 must undo to100 in one tap, not walk through digit fragments. A session ends on blur, selection change or explicit Undo. A completed toggle is one command; each new point is one command.
- Undo while the field is focused cancels pending debounce, restores the preceding geometry AND displayed input, and stays in the editor. Redo works from More. Undo can take a new drawing back to blank.
- The curved-back icon means Undo. Close/browser navigation means leave; do not hijack browser Back into geometry edits or risk trapping navigation.
- Avoid refitting/recentring on each keystroke. Preserve canvas and keyboard position. Refit only when requested or a new shape first appears.
- Avoid stale debounced callbacks changing the wrong selected leg. Bind the edit session to an explicit segment/end ID and cancel/flush at boundaries.
- Autosave must not remount ProfileEditor with each server revision. Keep history locally, reconcile acknowledgements, and use conflict UI for a genuine remote edit.
- Company-standard publication and placing an order remain explicit consequential actions. The owner's request removes repeated confirmation of ordinary drawing edits.

## Recovery and navigation

Existing-profile valid edits flow through the workspace save/recovery path. New incomplete flashings get an actor-scoped draft identity immediately; save unfinished sketch points locally. Persist both shape state and field drafts before navigating to details/lengths. 'Details' and 'Lengths' do not reset undo history. After reload, restore the same draft rather than a default profile.

Saved / Saving / On this device / Not synced must mean what they say. Do not show 'Saved' for a shape held only inside useState.

## Phone acceptance journeys

1. From Add flashing, create three legs, correct all three lengths, add a crush and flip it, without any Apply, Enter or intermediate Save action.
2. Tap an endpoint→Crush fold: two taps total, visible change immediately. Width edit needs no confirmation button.
3. Enter150 replacing100, then tap Undo: return to100 once; input and geometry agree.
4. Undo a crush, redo it; undo sketch points back to blank. Reload and restore an unfinished new shape.
5. Tap next dimension before debounce finishes; only the intended dimension changes.
6. Enter blank, '.',0, negative and nonnumeric text: geometry does not collapse and server never receives invalid profile data.
7. Receive a save acknowledgement while typing: no focus loss, keyboard closure, history reset or canvas jump.
8. Verify all on a real phone in installed PWA portrait and landscape. Record a short genuine touch workflow, not only scripted mouse clicks.
