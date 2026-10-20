---
title: Code Review & Quality Gates
category: software-development
triggers: ["review", "check code", "quality", "security", "lint", "format", "PR"]
tokens: 500
---

## Overview

**Code review** is a systematic way to catch bugs, security issues, and quality problems **before** code reaches main. This skill teaches:
- What to look for in code
- How to spot bugs during review
- Security checklist
- Performance red flags
- Style consistency

## Pre-Commit Review Checklist

Run this **before** opening a PR:

### Does It Work?
- [ ] Tests pass locally (`npm test`, `pytest`)
- [ ] No console errors or warnings
- [ ] Manual testing: does feature work as expected?
- [ ] Edge cases: null inputs, empty arrays, invalid data?

### Is It Secure?
- [ ] No hardcoded secrets (API keys, passwords)
- [ ] No SQL injection vulnerabilities
- [ ] Authentication/authorization checks present
- [ ] Sensitive data not logged
- [ ] External inputs validated
- [ ] Rate limiting on APIs

**Checklist (Detailed Security)**:
```
Secrets:
  ❌ API keys in code
  ❌ Passwords in git history
  ❌ Database connection strings hardcoded
  ✅ Use env vars (.env, secrets manager)

SQL/Injection:
  ❌ query(`SELECT * FROM users WHERE id = ${userId}`)
  ✅ query('SELECT * FROM users WHERE id = ?', [userId])

Auth:
  ❌ Skipped authentication check
  ❌ No permission check on delete endpoints
  ✅ Verify user is logged in
  ✅ Check user can access resource

Data:
  ❌ Logging passwords or tokens
  ❌ Storing unencrypted PII
  ✅ Encrypt sensitive fields
  ✅ Log only what's needed for debugging
```

### Is It Readable?
- [ ] Function names describe what they do
- [ ] Variables have clear names (not `x`, `data`, `stuff`)
- [ ] Complex logic has comments explaining WHY
- [ ] No dead code (commented-out code, unused variables)

**Example**:
```javascript
// ❌ Hard to understand
const p = (a, b) => {
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b) r++;
  }
  return r;
};

// ✅ Clear
const countItemsAboveThreshold = (items, threshold) => {
  return items.filter(item => item > threshold).length;
};
```

### Is It Efficient?
- [ ] No obvious N² loops (nested loops on same data)
- [ ] No redundant operations (computing same value twice)
- [ ] No memory leaks (event listeners removed, timers cleaned up)
- [ ] No unnecessary API calls

**Red Flags**:
```javascript
// ❌ O(n²) — inefficient
users.forEach(user => {
  projects.forEach(project => {
    console.log(user, project);  // If users=1000, projects=1000 → 1M iterations
  });
});

// ✅ O(n+m) — efficient
const userMap = new Map(users.map(u => [u.id, u]));
projects.forEach(p => {
  console.log(userMap.get(p.userId), p);
});
```

### Is It Covered by Tests?
- [ ] New code has tests
- [ ] Test covers happy path AND edge cases
- [ ] Test failure message is helpful (not "test failed")
- [ ] Tests don't rely on execution order (each is independent)

**Test Checklist**:
```javascript
// ✅ Good test
test('getUserById returns user with matching ID', () => {
  const user = getUserById(123);
  expect(user.id).toBe(123);
  expect(user.name).toBeDefined();
});

// ✅ Good test (edge case)
test('getUserById returns null for missing user', () => {
  const user = getUserById(9999);
  expect(user).toBeNull();
});

// ❌ Bad test (vague error)
test('user stuff works', () => {
  const x = getUser(1);
  expect(x).not.toBeUndefined();
});
```

### Style & Conventions
- [ ] Follows project's style guide (indentation, naming)
- [ ] No unused imports
- [ ] Consistent with rest of codebase
- [ ] Runs linter without warnings (`npm run lint`)
- [ ] Formatted properly (`npm run format`)

## Code Review Process (as Reviewer)

### During Review, Look For:

**1. Logic Bugs**
```javascript
// ❌ BUG: Off-by-one error
for (let i = 0; i <= array.length; i++) {
  console.log(array[i]);  // Accesses array[length], which is undefined
}

// ✅ FIXED
for (let i = 0; i < array.length; i++) {
  console.log(array[i]);
}
```

**2. Error Handling**
```javascript
// ❌ Crashes on network error
const users = await fetch('/api/users').then(r => r.json());

// ✅ Handles error gracefully
const users = await fetch('/api/users')
  .then(r => r.json())
  .catch(err => {
    console.error('Failed to load users:', err);
    return [];
  });
```

**3. State Management Issues**
```javascript
// ❌ Race condition: two async calls can overwrite state
const handleSearch = async (query) => {
  const results = await fetch(`/search?q=${query}`);
  setResults(results);  // Which query's results?
};

// ✅ Cancel previous request
const handleSearch = useCallback(async (query) => {
  const controller = new AbortController();
  const results = await fetch(`/search?q=${query}`, { signal: controller.signal });
  setResults(results);
  return () => controller.abort();
}, []);
```

**4. Performance**
```javascript
// ❌ Renders entire list on every keystroke
const [search, setSearch] = useState('');
const results = items.filter(item => item.name.includes(search));
return results.map(r => <Item key={r.id} {...r} />);

// ✅ Debounce search, memoize results
const debouncedSearch = useMemo(() => 
  debounce(setSearch, 300), 
  []
);
```

## Review Comments Template

**When suggesting changes**:

```markdown
## Suggestion: Use const instead of let

Instead of:
\`\`\`javascript
let user = getUser();
\`\`\`

Consider:
\`\`\`javascript
const user = getUser();
\`\`\`

Why: Prevents accidental mutation, makes intent clear. Use let only if value will change.
```

**When approving**:
```markdown
✅ Looks good! The error handling is solid, tests pass, and logic is clear.
```

## Integration with Agent

Before committing:
1. **Run linter**: `npm run lint`
2. **Run tests**: `npm test`
3. **Self-review**: Does code pass checklist?
4. **Security check**: Any hardcoded secrets? Input validation?
5. **Performance**: Any obvious N² loops?
6. **Commit**: If all green, commit

If issues found:
1. Fix them locally
2. Re-test
3. Commit again
4. Then push to PR

This prevents PRs with obvious issues.
