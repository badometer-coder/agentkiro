---
title: GitHub Workflow for Agents
category: software-development
triggers: ["pr", "pull request", "github", "commit", "push", "review", "merge", "issue"]
tokens: 600
---

## Overview

The **GitHub Workflow** teaches the agent how to work with Git and GitHub effectively:
- Create feature branches
- Commit with clear messages
- Open pull requests with descriptions
- Handle code reviews
- Merge and close issues

This mimics how professional developers collaborate.

## Core Workflow

```
Main Branch (Production)
    ↑
    ├─ [code review]
    ↑
PR (Pull Request)
    ↑
    ├─ Feature Branch: feat/user-auth
    ↑
Local Commits: "Add login form", "Fix validation"
```

### Step 1: Create Feature Branch

**When**: Starting new work (feature, bug fix)

```bash
# Branch naming: type/description
# Types: feat, fix, docs, refactor, test
git checkout -b feat/user-authentication
```

### Step 2: Make Commits with Clear Messages

**When**: After completing a logical unit of work

**Format**: `<type>: <description>`

```bash
# ✅ Good commit message
git commit -m "feat: add login form component"

# ✅ Good commit message
git commit -m "fix: validate email before signup"

# ❌ Bad: too vague
git commit -m "update code"

# ❌ Bad: mixes types
git commit -m "feat: add form AND fix validation"
```

**Message guidelines**:
- First line: 50 characters max, present tense ("add" not "added")
- Types: feat, fix, docs, refactor, test, style, chore
- One logical change per commit (one reason to revert it)

### Step 3: Push to Remote

```bash
git push -u origin feat/user-authentication
```

### Step 4: Open Pull Request (PR)

**When**: Ready for code review (all commits done)

**PR Description Template**:
```markdown
## What Changed
Brief summary of changes.

## Why
Why is this change needed? (fixes issue #123)

## How to Test
1. Checkout this branch
2. Run `npm test`
3. Check app in browser
4. Verify login works with test@example.com

## Type
- [ ] Bug fix
- [x] New feature
- [ ] Breaking change

## Checklist
- [x] Tests pass locally
- [x] No console errors
- [x] Code follows project style
```

### Step 5: Address Code Review

**When**: Reviewer asks for changes

**Process**:
1. Make changes on same branch
2. Commit with clear message (e.g., "fix: address review comments")
3. Push (no need for new PR)
4. Comment "Done, thanks for review"

### Step 6: Merge to Main

**When**: PR is approved and tests pass

```bash
# Merge via GitHub UI (preferred) OR:
git checkout main
git pull origin main
git merge feat/user-authentication
git push origin main
```

### Step 7: Close Issue

Link the PR to the issue:
```markdown
Closes #123
```

When PR merges, issue auto-closes.

## Best Practices

### Commit Habits

**✅ DO**:
- Commit frequently (every 15-30 min)
- Each commit is a working state
- Logical grouping (related changes together)
- Clear, descriptive messages

**❌ DON'T**:
- Huge commits with 50 files
- Vague messages ("stuff", "fixes")
- Mix multiple features in one commit
- Commit broken code

### PR Habits

**✅ DO**:
- Keep PRs small (100-300 lines)
- One feature per PR
- Good description for reviewers
- Run tests before opening PR

**❌ DON'T**:
- Massive PRs (1000+ lines)
- Mix features, fixes, and refactors
- Skip description ("please review")
- Merge without tests passing

### Code Review Habits

**✅ DO**:
- Address all feedback
- Ask questions if unclear
- Push fixes to same branch
- Thank reviewer

**❌ DON'T**:
- Argue with reviewers
- Ignore feedback
- Create new PR for same work
- Merge before approval

## Example Workflow

```bash
# 1. Create branch
git checkout -b feat/dark-mode

# 2. Make changes, test
npm test  # all pass ✅

# 3. Commit
git commit -m "feat: add dark mode toggle"
git commit -m "style: update colors for dark theme"

# 4. Push
git push -u origin feat/dark-mode

# 5. Open PR on GitHub
# (Title: "Add dark mode support")
# (Description: explains toggle, how to test, closes #456)

# 6. Reviewer comments: "Add test for theme persistence"
git commit -m "test: add dark mode persistence test"
git push  # same branch

# 7. Approved! Merge via GitHub UI
# PR auto-closes issue #456

# 8. Update local main
git checkout main
git pull origin main
# Now local main has dark mode feature
```

## Integration with Agent

When working on code:
1. **Create branch**: `git checkout -b feat/<task>`
2. **Make changes**: Implement feature
3. **Test locally**: `npm test`
4. **Commit clearly**: `git commit -m "feat: ..."`
5. **Push**: `git push -u origin feat/<task>`
6. **Open PR**: Describe changes, link issue
7. **Merge**: When approved

The agent treats Git like a professional developer:
- Branches for isolation
- Commits for clarity
- PRs for review
- Tests as gate-keepers

## Linking Issues to PRs

**In PR description**:
```markdown
Fixes #123
Closes #456
Related to #789
```

**Commit message**:
```bash
git commit -m "feat: add login - fixes #123"
```

This auto-closes issues when PR merges.

## Tips for Agents

- Always create feature branch (never commit to main)
- Commit after each working change
- Write clear messages for future code review
- Link PR to issue
- Push often (don't accumulate local commits)
- Never force push to shared branches
