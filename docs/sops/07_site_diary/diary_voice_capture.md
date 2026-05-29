---
sop_version: 1.0
last_reviewed: 2026-05-30
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
Lets you speak your site notes into the browser. The browser converts your speech to text, then the AI structures the transcript into a proper diary entry (same as typing — see SOP 07-01).

## 4. Before you start
- You are logged in on a device with a microphone (phone, tablet, or laptop)
- Your browser supports the Web Speech API — Chrome and Edge work best; Safari on iOS also works
- You have allowed the browser to access the microphone when prompted
- The project exists in the system

## 5. Step-by-step process

1. Open the project in Operations → click **Site Diary** → click **+ New Entry**
2. Click the **microphone icon** next to the text field
3. If prompted, click **Allow** to let the browser use your microphone
4. Speak your notes clearly — for example: *"It rained this morning, site was wet until midday. Concreters arrived at one pm, four men. They poured the slab for the garage. No issues. Tomorrow the frame crew starts."*
5. As you speak, your words appear in the text box in real time
6. When finished, click the **microphone icon** again to stop recording
7. Review the transcript — correct any words the speech recognition got wrong
8. Click **Structure with AI** to organise the transcript into diary sections
9. Review the structured output, make any edits, then click **Save Entry**

## 6. What happens after
Same as SOP 07-01 — the entry is saved to the `site_diary` table and appears in the project diary list.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Browser blocks microphone access | Permission not granted | Click Allow when the browser asks; check browser site permissions settings if the prompt never appeared |
| Speech recognition garbles technical words | Trade names and addresses can confuse the transcriber | Review the transcript before clicking Structure — fix trade names, addresses, or measurements |
| Recording stops unexpectedly | Silence detected (browser auto-stops after a pause) | Tap microphone to restart if it stops mid-sentence |
| Using Safari on an older iPad | Older iOS versions have limited Speech API support | Use Chrome on Android or a laptop for the most reliable experience |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Microphone icon is greyed out | Your browser does not support Web Speech API — switch to Chrome or Edge |
| "Microphone access denied" message | Go to browser settings → Site Permissions → Microphone → allow this site |
| No text appears while speaking | Check microphone is not muted on the device; try refreshing the page |
| Structure with AI returns an error after voice input | The transcript is treated identically to typed text — see SOP 07-01 troubleshooting |

## 9. Related SOPs
- [Write a site diary entry](diary_write_entry.md) — SOP 07-01 (typed workflow)
- [View and edit past diary entries](diary_view_entries.md) — SOP 07-03

## 10. Automation notes
- Voice capture is handled entirely in the browser using the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) — no server call is made during recording
- Once the transcript is in the text field, the same APIs as SOP 07-01 apply:
  - API: `POST /api/diary/structure` — structures the transcript
  - API: `POST /api/diary/save` — saves the entry
- DB effects: identical to SOP 07-01 — inserts into `site_diary` with `raw_text` containing the voice transcript

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in on a Chrome browser (desktop or Android)
- [ ] Microphone permission granted for the app domain
- [ ] At least one project exists in Operations

### Test cases

**TC-01 — Microphone button is visible and enabled in Chrome**
1. Open a project → Site Diary → + New Entry
2. Expected: microphone icon is visible next to the text input
3. Expected: clicking the icon triggers browser permission prompt (if not already granted) or starts recording immediately
- [ ] Pass  [ ] Fail

**TC-02 — Voice transcript populates text field**
1. Click microphone, speak: "Sunny today. Frame crew on site."
2. Expected: words appear in the text field as you speak
3. Expected: clicking microphone again stops recording
- [ ] Pass  [ ] Fail

**TC-03 — Transcript is editable before structuring**
1. After recording, click into the text field
2. Manually correct a word or add text
3. Expected: text field is fully editable
- [ ] Pass  [ ] Fail

**TC-04 — Structure with AI works on voice transcript**
1. With a voice transcript in the text field, click Structure with AI
2. Expected: AI returns structured diary sections
3. Expected: no difference in behaviour from a typed entry
- [ ] Pass  [ ] Fail

**TC-05 — Save after voice capture persists correctly**
1. After structuring, click Save Entry
2. Expected DB: `SELECT raw_text FROM site_diary ORDER BY created_at DESC LIMIT 1` — the `raw_text` contains the voice transcript
3. Expected: entry visible in diary list
- [ ] Pass  [ ] Fail

**TC-06 — Graceful fallback when speech API unavailable**
1. Open the new entry page in a browser that does not support Web Speech API (e.g. Firefox)
2. Expected: microphone icon is either hidden or shows a "not supported" message
3. Expected: text input is still available for typing
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Voice recording starts and stops correctly
- [ ] Transcript populates text field in real time
- [ ] Structure and save work identically to typed entry
- [ ] Graceful fallback for unsupported browsers
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
