# /ship — Lint → build → commit → push

Safe deploy flow for Blue Leaf Hub. Run this when a sprint or fix is finished and ready for production.

## Steps

1. **Run /check first** — execute all steps from the `/check` command. If any check fails, stop and report what needs fixing before continuing.

2. **Git status** — show all modified/untracked files that will be committed.

3. **Draft commit message** — analyse the staged changes and write a concise commit message (imperative mood, 1-2 sentences, focus on "why" not "what"). Follow the repo convention of ending with:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

4. **Confirm with user** — show the file list and draft commit message. Wait for approval before committing.

5. **Commit and push** — `git add` the relevant files, `git commit`, `git push origin main`.

6. **Report** — confirm push succeeded and show the commit hash.

## Notes
- Never force-push to main
- Never skip hooks (`--no-verify`)
- If Railway/Vercel auto-deploys from main, remind the user the deploy will trigger automatically
