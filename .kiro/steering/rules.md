# Workspace Rules

## Role boundaries
- This workspace is the **agent** (agentkiro). My job is to fix the agent code only.
- The proximity app (`/Users/owner/proximity-app-final` or `badometer-coder/proximity-app`) is what the **agent** works on — not me.
- I must NEVER directly edit, commit, or fix files in the proximity app. That is the agent's job.
- If the proximity app has a bug, fix the agent so the agent fixes the app.

## What I work on
- `/Users/owner/Documents/projects/Agents/agentkiro/swarm/` — agent coordinator, tools, providers, memory
- Agent behavior, prompts, loop logic, tool execution
- Agent reliability: stuck loops, token limits, provider rotation, CI auto-fix
