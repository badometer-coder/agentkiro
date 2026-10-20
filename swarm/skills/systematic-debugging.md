---
title: Systematic Debugging
category: software-development
triggers: ["bug", "error", "debug", "crash", "failing", "broken", "not working"]
tokens: 500
---

## Overview

Systematic debugging is a **4-phase methodology** to find and fix bugs efficiently:

1. **OBSERVE**: Reproduce the bug reliably
2. **ISOLATE**: Find the exact code causing it (narrow down)
3. **UNDERSTAND**: Why is it broken? (root cause)
4. **FIX**: Implement the minimal fix, then verify

Most developers jump to fixing (phase 4). This skill teaches phases 1-3 first.

## Why This Matters

- Fixing the wrong thing wastes time
- Understanding the root cause prevents regressions
- Systematic approach finds bugs faster than random guessing
- Catches symptoms vs causes (e.g., "API returns null" vs "caller doesn't check for null")

## The 4-Phase Process

### Phase 1: OBSERVE — Reproduce Reliably

**Goal**: Get the bug to happen consistently.

- [ ] What triggers the bug? (specific user action, input, time)
- [ ] Does it happen every time? (consistent or intermittent)
- [ ] What's the exact error? (message, stack trace, unexpected output)
- [ ] In what environment? (local, staging, production)

**Example Bug**: "App crashes when I search for 'foo'"

```
OBSERVE:
- Trigger: Search input = "foo"
- Consistent: Yes, every time
- Error: TypeError: Cannot read property 'name' of undefined
- Stack: getUserProfile() → line 45 in api.js
- Environment: Local dev
```

### Phase 2: ISOLATE — Narrow Down the Bug

**Goal**: Find the exact function/line causing it.

Techniques:
- Add console logs around suspect code
- Use debugger breakpoints to step through
- Check if bug reproduces with simpler inputs
- Isolate by removing features (does it work without this dependency?)

**Example**:
```javascript
// Search code:
function searchUsers(query) {
  const users = api.getUsers(query);        // Line 40
  const profiles = users.map(user => {      // Line 41
    return getUserProfile(user.id);         // Line 42 — ERROR HERE?
  });
  return profiles;
}

// ISOLATE: Add logs
function searchUsers(query) {
  console.log('Query:', query);
  const users = api.getUsers(query);
  console.log('Users returned:', users);    // Check: is this array?
  
  const profiles = users.map(user => {
    console.log('Processing user:', user);
    return getUserProfile(user.id);
  });
  return profiles;
}

// Run again → logs show: user = undefined
// ROOT CAUSE FOUND: api.getUsers() is returning objects with missing user.id
```

### Phase 3: UNDERSTAND — Find Root Cause

**Goal**: Why is this code path broken?

Ask:
- Is the input wrong? (api.getUsers returning bad data)
- Is the code assuming something that's not true? (user.id exists)
- Did something change? (recent commit, new dependency)
- Is this a side effect? (race condition, async issue, state pollution)

**Example**:
```javascript
// Root cause analysis:
// api.getUsers() sometimes returns:
// [{ id: 1, name: 'Alice' }, { name: 'Bob' }]  ← user 2 has no ID!

// Why? Let's check the API:
function getUsers(query) {
  const results = database.query(query);
  return results.map(user => ({
    id: user.user_id,      // ← Typo! Should be user.id
    name: user.name
  }));
}

// ROOT CAUSE: Database returns 'id', code looks for 'user_id'
// When some users have NULL user_id, they get { name: 'Bob' } (missing id)
```

### Phase 4: FIX — Implement Minimal Fix

**Goal**: Fix the root cause, verify tests pass.

**Fix** (minimal):
```javascript
// Change the mapping:
function getUsers(query) {
  const results = database.query(query);
  return results.map(user => ({
    id: user.id,           // ← Fixed typo
    name: user.name
  }));
}
```

**Verify**:
```javascript
// Test it:
const users = getUsers('foo');
console.log(users);  // [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

// ✅ All users have ID now
// Run existing tests to ensure no regression
```

## Checklist: Systematic Debugging

- [ ] **OBSERVE**: Can you reproduce it consistently?
- [ ] **OBSERVE**: What's the exact error/symptom?
- [ ] **ISOLATE**: Which function causes it? Add logs to narrow down.
- [ ] **ISOLATE**: What's the exact line / input?
- [ ] **UNDERSTAND**: Why is that code path broken?
- [ ] **UNDERSTAND**: Is input wrong or code assumption wrong?
- [ ] **FIX**: Minimal fix for root cause (not symptom)
- [ ] **FIX**: Verify fix works + tests pass

## Common Pitfalls

**❌ Don't**: Jump to fixing (you'll fix the symptom, not cause)
**✅ Do**: Spend 70% time on OBSERVE+ISOLATE+UNDERSTAND, 30% on FIX

**❌ Don't**: Add random logging everywhere
**✅ Do**: Add targeted logs to narrow down quickly

**❌ Don't**: Fix symptoms (e.g., "null check this variable")
**✅ Do**: Fix root causes (e.g., "why is variable null in first place?")

**❌ Don't**: Assume you know the cause
**✅ Do**: Verify with logs/debugger before fixing

## Example: Bug in Production

```
SYMPTOM: User says "My profile picture won't upload"

PHASE 1 - OBSERVE:
- Reproduces on mobile only (desktop works)
- Error: "Upload failed"
- Stack trace points to utils/upload.js line 23

PHASE 2 - ISOLATE:
- Add logs to upload function
- Check: Is file being read? ✓
- Check: Is API endpoint called? ✓
- Check: Is response received? ✗ (timeout)
- Culprit: Network request timing out on mobile

PHASE 3 - UNDERSTAND:
- Mobile on 4G has 2s timeout
- Desktop on wifi has 10s timeout
- Image upload takes 5s (file is 15MB)
- Root cause: Timeout too short for large file on slow network

PHASE 4 - FIX:
- Increase timeout: 2s → 15s for mobile
- Add progress UI (chunked upload)
- Test on mobile 4G, verify works
```

## Integration with Agent

When debugging:
1. **User**: "I'm getting an error in X"
2. **Agent OBSERVES**: Reproduces consistently, gets exact error
3. **Agent ISOLATES**: Adds logs, narrows to exact code path
4. **Agent UNDERSTANDS**: Analyzes root cause (input vs code)
5. **Agent FIXES**: Implements minimal fix
6. **Agent VERIFIES**: Tests pass, error gone

This ensures bugs are truly fixed, not just masked.
