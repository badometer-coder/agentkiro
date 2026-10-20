# agentkiro Skills

Reusable skills that teach the agent specific workflows and patterns. Each skill is a markdown file with:
- **Frontmatter**: Metadata (title, category, triggers)
- **Content**: Progressive disclosure of knowledge (overview → detailed steps → examples)

## Skills Loaded

- `test-driven-development.md` — TDD workflow (RED-GREEN-REFACTOR)
- `systematic-debugging.md` — 4-phase debugging methodology
- `github-workflow.md` — GitHub PR/issue management
- `requesting-code-review.md` — Pre-commit security & quality checks
- `grounded-citations.md` — Fact-backed research with sources

## How Skills Work

1. Agent detects task type from user message
2. Auto-loads matching skill into context
3. LLM follows skill's workflow/pattern
4. Skill survives across multiple turns (cached)

## Adding New Skills

Create a new `.md` file with:
```yaml
---
title: Skill Name
category: software-development
triggers: ["keyword1", "keyword2"]
tokens: 500  # approximate token cost
---

## Overview
Brief description.

## Pattern / Workflow
Step-by-step guide.

## Example
Real example usage.
```

**Rule**: Keep skills focused and reusable. One pattern per skill.
