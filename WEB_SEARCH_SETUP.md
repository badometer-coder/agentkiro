# Web Search Setup Verification Checklist

## ✅ Implementation Complete

### Files Created/Modified
- [x] `swarm/web-search.js` - Web search module (free DuckDuckGo API)
- [x] `swarm/agent-coordinator.js` - Integrated web search into task execution
- [x] `package.json` - Added `node-fetch` dependency
- [x] Help commands updated with web search documentation

### Web Search Features
- [x] Generic web search with `/search <query>`
- [x] Query caching (1-hour TTL)
- [x] React Native docs search
- [x] Expo docs search
- [x] TypeScript error solution search
- [x] Cache management commands (`/cache-stats`, `/cache-clear`)

### Integration Points
- [x] Task execution: Searches for API keywords before LLM call
- [x] Error debugging: Searches for TS error solutions
- [x] Context injection: Real docs added to LLM prompt
- [x] Logging: Web search activity logged to console

### Safeguards Active
- [x] Batch-commit logic (prevents CI loops)
- [x] Pre-commit verification (only commit if errors decrease)
- [x] Auto-revert on failure
- [x] Max retry limit (3 attempts)
- [x] Truncation rejection (incomplete code blocked)
- [x] File-filtering (only fix files with errors)
- [x] Stop command support

## 📋 Pre-Deployment Steps

Before re-enabling the CI webhook, follow these steps:

### 1. Test Web Search Manually
```bash
# In Telegram (start agent first):
/search react-native useLocation API
/cache-stats
```
Expected: Search results appear, cache stats show queries

### 2. Test Task Execution with Web Search
```bash
/init
/execute
```
Expected: Logs show "🔍 Searching web for API documentation on: ..."

### 3. Verify No Hallucinations
- Check generated code uses only real API properties
- Check errors decrease or go to zero
- Check single commit in git history

### 4. Re-enable CI Webhook (Optional)
Edit `swarm/health-server.js`:
1. Find `setCIErrorCallback` section
2. Remove or comment the early `return` statement
3. This will enable auto-fix on CI failures

### 5. Deploy to Render
```bash
git add -A
git commit -m "feat: add web search capability to agent"
git push origin main
```

## 🧪 Testing Scenarios

### Scenario 1: Search During Task Execution
```
Input Task: "Use useAuth hook to get current user and sign out"
Process:
  → Agent detects 'useAuth' keyword
  → Searches: "useAuth React Native TypeScript API documentation"
  → Gets real hook signature
  → Generates code with correct properties
  → No hallucinations
Result: ✅ Code compiles
```

### Scenario 2: Search During Error Fixing
```
Compile Error: TS2339 "Property 'refreshLocation' does not exist"
Process:
  → Agent extracts error code: TS2339
  → Searches: "TS2339 TypeScript property does not exist solution"
  → Gets error patterns and fixes
  → Generates corrected code
  → No repeated hallucinations
Result: ✅ Fixed code compiles
```

### Scenario 3: Cache Hit (Subsequent Tasks)
```
Same keyword: useAuth (second time)
Process:
  → Agent checks cache
  → Cache hit! Returns cached docs (~0 seconds)
  → No additional API call
Result: ✅ Faster execution
```

## 🔍 Monitoring Commands

View these in Telegram to monitor web search:

```
/cache-stats      → Shows: 5 cached queries
/search "test"    → Test search manually
/cache-clear      → Reset cache if needed
```

## 📊 Expected Improvements

### Before Web Search
- Agent invents APIs: `calculateDistanceKm`, `errorMsg`, `isLoading`
- CI loop: 10+ attempts with hallucinations
- Error rate: 80-90% of commits fail
- Debugging: Manual intervention needed

### After Web Search
- Agent uses real APIs only
- CI loop: 1 attempt completes
- Error rate: < 5% (only real bugs)
- Self-healing: Automatic error fixing works

## 🛑 Troubleshooting

### Web Search Returns No Results
```javascript
// In agent logs, you'll see:
⚠️ Web search failed (continuing without): [error message]
```
→ Agent will continue without web search (graceful degradation)
→ No broken code, just slower debugging

### Cache Growing Too Large
```
// Clear cache periodically:
/cache-clear
```
→ Runs in seconds
→ Next task will rebuild cache

### Agent Still Hallucinating
```
// Check:
1. /cache-stats shows searches are cached
2. Agent logs show "🔍 Searching web for..."
3. Web search results appear in debug output

// If not:
→ Disable other context that might be overriding web results
→ Check that web search is actually being injected into prompt
```

## ✅ Deployment Checklist

- [x] Web search module syntax verified
- [x] Agent coordinator syntax verified
- [x] Dependencies installed (`npm install`)
- [ ] Manual test task execution works
- [ ] Web search appears in agent logs
- [ ] Cache fills up with real API docs
- [ ] Git commit count = task count (not N commits per task)
- [ ] No CI loops observed (single run per failure)
- [ ] Error count decreases or stays low after fixes
- [ ] Ready to re-enable webhook

---

**Last Updated**: October 2026
**Status**: Ready for Testing & Deployment
