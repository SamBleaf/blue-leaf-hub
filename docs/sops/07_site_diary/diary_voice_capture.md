---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 07-02: Use Voice Capture for a Diary Entry

**Module:** Operations Manager — Site Diary  
**SOP ID:** 07-02  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Site supervisors who prefer to speak their notes rather than type — especially useful on site with dirty hands or when moving quickly between tasks.

## 2. When to use it
Any time you want to record a diary entry hands-free. Works best on a phone or tablet with a microphone.

## 3. What this does
Lets you speak your site notes into the browser. The browser converts your speech to text using the Web Speech API, then the AI structures the transcript into a proper diary entry (same as typing — see SOP 07-01). Voice capture requires a role of Admin or Supervisor — field workers writing basic notes use the text box directly.

## 4. Before you start
- You are logged in as Admin or Supervisor (voice capture is gated to these roles)
- You are on a device with a microphone (phone, tablet, or laptop)
- Your browser supports the Web Speech API — Chrome and Edge work best; Safari on iOS also works
- You have allowed the browser to access the microphone when prompted
- The project exists in the system

## 5. Step-by-step process

1. Open the project in Operations → click **Site Diary**
2. In the **1. Record** section, click the **Mic** button (red pulsing while active)
3. If prompted, click **Allow** to let the browser use your microphone
4. Speak your notes clearly — for example: *"It rained this morning, site was wet until midday. Concreters arrived at one pm, four men. They poured the slab for the garage. No issues. Tomorrow the frame crew starts."*
5. As you speak, your words appear in the transcript text box in real time
6. When finished, click the **Stop** button (same button, now labelled Stop while recording) — the button stops pulsing
7. Review the transcript in the text box — correct any words the speech recognition got wrong by clicking into the text box and editing
8. Click **Structure with AI** to organise the transcript into diary fields
9. Review the structured output in the Review section, make any edits, then click **Save entry**

**Note:** The transcript text box is fully editable at any point. If you are in a noisy environment or the mic is not available, you can skip the Mic button and type directly.

## 6. What happens after
Same as SOP 07-01 — the entry is saved to the `site_diary` table with `raw_voice_transcript` containing the original voice transcript. A PDF is generated and filed to Dropbox. The entry appears in the Past entries panel.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Browser blocks microphone access | Permission not granted | Click Allow when the browser asks; check browser site permissions settings if the prompt never appeared |
| Speech recognition garbles technical words | Trade names and addresses can confuse the transcriber | Review the transcript before clicking Structure — fix trade names, addresses, or measurements |
| Recording stops unexpectedly | Silence detected (browser auto-stops after a pause) | Click Mic to restart if it stops mid-sentence; the existing transcript is preserved |
| Mic button not visible | Role is not Admin or Supervisor | Log in with the correct role; field workers use the text box directly |
| Using Safari on an older iPad | Older iOS versions have limited Speech API support | Use Chrome on Android or a laptop for the most reliable experience |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Mic button is not visible | Your role may be field worker — voice capture is restricted to Admin and Supervisor roles |
| "Could not start microphone." error | Browser permission was denied or microphone is in use by another app — check browser site permissions and close other apps using the mic |
| No text appears while speaking | Check microphone is not muted on the device; ensure the browser has mic permission; try refreshing the page |
| Recording stops mid-sentence | Browser speech API pauses on silence — click Mic again to resume; existing transcript is preserved in the text box |
| Structure with AI returns an error after voice input | The transcript is treated identically to typed text — see SOP 07-01 §8 troubleshooting |

## 9. Related SOPs
- [Write a site diary entry](diary_write_entry.md) — SOP 07-01 (typed workflow)
- [View past diary entries](diary_view_entries.md) — SOP 07-03

## 10. Automation notes
- Voice capture uses the browser's Web Speech API (`window.SpeechRecognition || window.webkitSpeechRecognition`) — no server call is made during recording; `r.lang = "en-AU"`, `r.continuous = true`, `r.interimResults = true`
- Role gate: `can.editSchedule(role)` (Admin / Supervisor) — the Mic button is only rendered for these roles
- Once the transcript is in the text box, the same APIs as SOP 07-01 apply:
  - API: `POST /api/diary/structure` — structures the transcript
  - API: `POST /api/diary/save` — saves the entry with `raw_voice_transcript` set to the original spoken text
- DB effects: identical to SOP 07-01 — `raw_voice_transcript` stores the voice text; `structured_by_ai` is `true` if Structure with AI was used

## 11. Screenshot placeholders
[insert screenshot: Record section showing pulsing red Mic button with "● Recording" indicator]
[insert screenshot: Transcript text box with voice text, ready to Structure]

## 12. Edge cases

| Scenario | Expected behaviour |
|----------|-------------------|
| Speech API not supported (e.g. Firefox) | Mic button is not rendered; plain text area is shown instead; user can type manually |
| User speaks then edits transcript | Text box is fully editable — any edits before Structure are included in the AI call |
| Recording starts and user speaks nothing | Empty transcript — Structure with AI button is disabled (requires non-empty transcript) |
| Mic button clicked twice rapidly | Second click stops the recorder before it starts — safe; no crash |
| Microphone denied mid-recording | `onerror` fires — recording state resets; error cleared; user prompted to check permissions |
| Role is field worker | Mic button not rendered — field worker uses the plain text area in the simplified FieldDiary view |

## 13. Owner of the process
Admin  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin or Supervisor on Chrome (desktop or Android)
- [ ] Microphone permission granted for the app domain in browser settings
- [ ] At least one project exists in Operations
- [ ] Note the project ID for DB verification

### Test cases

**TC-01 — Mic button is visible for Admin/Supervisor role**
1. Log in as Admin → open a project → click Site Diary
2. Expected: Mic button is visible in the Record section
3. Log in as a field worker role → repeat
4. Expected: Mic button is NOT visible for field worker — text area only
- [ ] Pass  [ ] Fail

**TC-02 — Voice transcript populates text box**
1. Click Mic
2. Speak: "Sunny today. Frame crew on site, four men."
3. Expected: words appear in the text box in real time while speaking
4. Expected: Mic button is pulsing red and shows "Stop" while recording
5. Click Stop
6. Expected: button stops pulsing, shows "Mic" again
- [ ] Pass  [ ] Fail

**TC-03 — Transcript is editable before structuring**
1. After recording, click into the text box
2. Manually correct a word or add additional text
3. Expected: text box is fully editable; changes persist when you click Structure
- [ ] Pass  [ ] Fail

**TC-04 — Structure with AI works on voice transcript**
1. With a voice transcript in the text box (at least 1 sentence), click Structure with AI
2. Expected: review fields (weather, trades, work_completed etc.) populate from the transcript
3. Expected: no different behaviour from a typed entry
- [ ] Pass  [ ] Fail

**TC-05 — Save after voice capture persists correctly**
1. After structuring, click Save entry
2. Expected: green toast "Saved. PDF filed to Dropbox."
3. Expected DB: `SELECT raw_voice_transcript FROM site_diary ORDER BY created_at DESC LIMIT 1` contains the voice transcript text
4. Expected: entry visible in Past entries panel
- [ ] Pass  [ ] Fail

**TC-06 — Graceful fallback when speech API unavailable**
1. Open the Site Diary page in a browser that does not support Web Speech API (e.g. Firefox)
2. Expected: Mic button is not rendered
3. Expected: plain text area is visible and usable — user can type manually
4. Expected: no JavaScript errors thrown related to the missing Speech API
- [ ] Pass  [ ] Fail

**TC-07 — Structure button disabled when transcript is empty**
1. Open Site Diary with an empty text box (or clear the text box after a recording)
2. Expected: Structure with AI button is disabled (greyed out, not clickable)
3. Expected: clicking it has no effect
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Mic button correctly gated by role
- [ ] Voice recording starts and stops correctly
- [ ] Transcript populates text box in real time
- [ ] Text box is editable before structuring
- [ ] Structure and save work identically to typed entry
- [ ] raw_voice_transcript stored in DB
- [ ] Graceful fallback for unsupported browsers
- [ ] Structure button disabled when empty
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
