---
title: Test-Driven Development (TDD)
category: software-development
triggers: ["test", "testing", "feature", "implement", "bug fix", "write code"]
tokens: 450
---

## Overview

Test-Driven Development (TDD) enforces the **RED-GREEN-REFACTOR** cycle:
1. **RED**: Write a failing test (for a feature that doesn't exist yet)
2. **GREEN**: Write minimal code to make the test pass
3. **REFACTOR**: Clean up code while keeping tests green

This forces clear thinking about requirements before coding. Every line of production code has a corresponding test.

## Why This Matters

- Catches bugs early (test-first prevents unforeseen issues)
- Forces clear API design (tests define the contract)
- Provides regression safety (refactor without fear)
- Saves time overall (catch bugs when cheap to fix)

## The Pattern: RED-GREEN-REFACTOR

### 1. RED: Write Failing Test
Write a test for the feature **you want to build**. It should fail.

```javascript
// ❌ RED: Test fails (feature doesn't exist)
test('converts user ID to profile URL', () => {
  const url = getUserProfileUrl(123);
  expect(url).toBe('https://app.com/profile/123');
});
```

### 2. GREEN: Minimal Implementation
Write the **simplest code** that makes the test pass.

```javascript
// ✅ GREEN: Test passes (minimal code)
function getUserProfileUrl(userId) {
  return `https://app.com/profile/${userId}`;
}
```

### 3. REFACTOR: Improve Without Breaking
Improve code quality while keeping tests green.

```javascript
// ✅ REFACTOR: Still passes, cleaner
const getUserProfileUrl = (userId) => 
  new URL(`profile/${userId}`, 'https://app.com').toString();
```

## Checklist: Always Follow This Order

- [ ] Write test (RED)
- [ ] Run test (should fail)
- [ ] Write minimal code (GREEN)
- [ ] Run test (should pass)
- [ ] Refactor and verify tests still pass

**WRONG**: Write code, then tests.
**RIGHT**: Write tests, then code.

## When to Use This Skill

- Starting a new feature
- Fixing a bug (write test that reproduces bug first)
- Refactoring code (tests verify nothing broke)
- Any time you think "I should test this later" (do it now)

## Examples by Language

### JavaScript/TypeScript (Jest)
```javascript
// 1. RED: Write failing test
describe('Email validator', () => {
  it('rejects invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
  });
});

// 2. GREEN: Minimal code
function isValidEmail(email) {
  return email.includes('@');
}

// 3. REFACTOR: Better regex
const isValidEmail = (email) => 
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
```

### Python (pytest)
```python
# 1. RED: Failing test
def test_add():
    assert add(2, 3) == 5

# 2. GREEN: Minimal code
def add(a, b):
    return a + b

# 3. REFACTOR: Already clean, done!
```

## Common Pitfalls

**❌ Don't**: Write tests after code (defeats the purpose)
**✅ Do**: Write tests first, code second

**❌ Don't**: Write overly complex tests upfront
**✅ Do**: Write minimal tests, refactor tests too

**❌ Don't**: Skip refactoring because "tests pass"
**✅ Do**: Refactor constantly (tests prove you didn't break anything)

## Integration with Agent

When working on code:
1. User says "add feature X"
2. **TDD Skill**: Write test for X first
3. Run test (red)
4. Write minimal code (green)
5. Refactor and verify
6. Commit with both test and code

This approach ensures every feature is testable and working.
