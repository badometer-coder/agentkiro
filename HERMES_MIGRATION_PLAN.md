# Strategy Plan: Make Agentkiro as capable as Hermes

## Goal
Port Hermes' discipline (action bias, tight loops, smart context) to Agentkiro's Node.js/Telegram agent without breaking existing behavior.

## Current State
- Agentkiro works but explores too much, reads redundant files, hits Groq token limits
- Has tool calling, GitHub API ops, memory/skills, multi-provider
- Missing Hermes' strict turn discipline and forced action

## Hermes Patterns to Port

### 1) Turn Loop Discipline (Highest Impact)
From `turn_tool_round.py`:
- **Persist-before-execute**: We already push tool results to messages before continuing. Keep this.
- **Action bias**: If reads >= 2 and no edits yet by round 2, force next turn to edit
- **Stuck detection**: We have it but need to be smarter
- **Round limits**: For simple fixes, cap tighter

### 2) Smart Context Management
From Hermes approach:
- **Keep original user message** - Always in context
- **Summarize old results** - Don't dump full 6KB files into every round
- **Limit history aggressively** - We did this (down to 4 turns)
- **File relevance tracking** - Only keep results of files that might be edited

### 3) Tool Dispatch (Medium Impact)
From `tool_dispatch_helpers.py`:
- **Parallel limits** - Cap to 2-3 reads max per round (done partially)
- **Deduplication** - Avoid reading same file twice
- **Cache hits** - We have this

### 4) Error Recovery (Medium Impact)
From `turn_loop_errors.py`:
- **Classify errors** - Local vs API errors
- **Don't retry forever** - We have provider rotation
- **Fill unanswered tool calls** - Prevent malformed messages

## Implementation Plan

### Phase 1: Enforce Action Bias (Do First)
**File:** `swarm/agent-coordinator.js`

Changes:
1. Track `readCount`, `editCount` per task (done)
2. After round 2 with >=2 reads and 0 edits, inject nudge: "STOP READING. You know enough to fix this. Use patch now."
3. Block additional read_file calls if we've already read the target file once and haven't edited yet
4. For UI/layout keywords, force path to known files

### Phase 2: Smarter Context (Do Second)
**File:** `swarm/agent-coordinator.js`

Changes:
1. When trimming history, summarize tool results instead of truncating blindly
2. Keep system prompt + original user msg + last 2 turns + any edited files
3. Drop old read results that weren't acted on
4. Compress file contents to key sections

### Phase 3: Tighter Tool Rules (Do Third)
**File:** `swarm/agent-coordinator.js`

Changes:
1. Max 2 parallel reads per round
2. If same file read twice -> force edit
3. For patch/write, allow immediately after read
4. Add "edit budget" - must edit within 4 rounds of reading target file

### Phase 4: Provider/Token Optimization (Ongoing)
**File:** `swarm/multi-llm-provider.js`

Changes:
1. Lower max_tokens further if needed (done)
2. Better model selection per task type
3. Smarter rotation

## Quick Wins (Implement Now)

1. **Force action nudge** - Add to messages when stuck in read loop
2. **Target file enforcement** - For header/spacing -> only ProximityHeader.tsx
3. **Edit requirement** - If round >= 3 and editCount == 0, force patch
4. **Cap parallel reads** - Max 2 per round

## Testing
- Test with "header too low" message
- Should read 1 file, patch in round 2, done in round 3
- No more 10-round exploration loops

## Files to Modify
- `swarm/agent-coordinator.js` - Main changes
- `swarm/multi-llm-provider.js` - Token limits
- `swarm/agent-tools.js` - Maybe add better search
