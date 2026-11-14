# Project agent workflow

- GPT is the primary agent: plan the work, make architectural decisions, integrate changes, verify results, and respond to the user.
- Use the Gemini-backed `explore` subagent for focused read-only searches and the `general` subagent for bounded independent tasks when delegation is useful. Handle trivial tasks directly.
- Give each subagent the relevant context, expected output, and explicit file ownership. Do not delegate overlapping edits in parallel.
- The primary agent must review subagent findings and changes and run appropriate checks before accepting them. Keep security-sensitive decisions and final approval with the primary agent.
- Subagents must preserve existing user changes and must not commit, push, merge, deploy, delete branches, or modify external data unless the user explicitly authorizes that operation and the primary agent includes that authorization in the task.
- If Gemini fails due to quota or availability, report the failure and continue with the primary GPT agent; do not silently claim that Gemini completed the task.
