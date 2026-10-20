---
title: Grounded Citations (Fact-Backed Research)
category: research
triggers: ["research", "find", "search", "claim", "verify", "source", "citation", "reference"]
tokens: 400
---

## Overview

**Grounded citations** means every factual claim is backed by a verifiable source link. This skill teaches the agent:
- How to find reliable sources
- How to cite them properly
- How to distinguish facts from opinions
- How to surface sources for verification

This prevents hallucinations and builds trust.

## The Pattern

### 1. Make a Claim
```
"React 18 added concurrent rendering"
```

### 2. Cite the Source
```
"React 18 added concurrent rendering. [Learn more](https://react.dev/blog/2022/03/29/react-v18)"
```

### 3. Verify It's Authoritative
- Official documentation (react.dev)
- Published research (arxiv.org)
- News from verified source (TechCrunch, not random blog)
- Do NOT cite rumor blogs or unverified sources

## How to Ground Your Claims

### For Technical Topics
**Best sources** (in order):
1. Official docs (react.dev, python.org, nodejs.org)
2. Academic papers (arxiv.org)
3. Major tech publications (The Verge, Hacker News)
4. Verified blogs (Martin Fowler, Dan Abramov)

**Avoid**:
- Medium posts by random users
- Reddit comments
- HN comments (low quality)
- Unverified blogs

### For News/Current Events
**Best sources**:
1. Primary source (official announcement)
2. Major news (Reuters, AP, BBC)
3. Specialized press (TechCrunch for tech)

**Avoid**:
- Blogs rewriting news
- Social media posts
- Aggregators without fact-checking

### For Research
**Best sources**:
1. Peer-reviewed papers (arxiv.org, published journals)
2. Research institutions (MIT, Stanford, DeepMind)
3. Original datasets (Kaggle, UCI ML Repository)

## Example: Fact-Checking

### ❌ Bad (No Sources)
```
"LLMs use attention mechanisms to process text sequentially.
They have about 175 billion parameters and can be fine-tuned
for specific tasks."
```

### ✅ Good (Grounded)
```
"LLMs use attention mechanisms to process text. [Learn more about 
transformers](https://arxiv.org/abs/1706.03762).

The original GPT-3 model has 175 billion parameters.
[See model details](https://arxiv.org/abs/2005.14165).

They can be fine-tuned for specific tasks to improve performance.
[Fine-tuning guide](https://platform.openai.com/docs/guides/fine-tuning)."
```

## Citation Format

### Inline Citation (Preferred)
```markdown
According to [official React docs](https://react.dev/reference/react/hooks),
hooks are functions that let you use state in functional components.
```

### Footnote Citation
```markdown
React introduced hooks to enable state in functional components[1].

[1] https://react.dev/reference/react/hooks
```

### Direct Quote with Attribution
```markdown
> "Hooks let you use state and other React features 
> without writing a class." — [React Documentation](https://react.dev/reference/react/hooks)
```

## Building a Fact-Checked Document

### Process
1. Make claim
2. Find source immediately
3. Include link inline
4. If no source exists, flag as opinion or remove

### Example Research Output

```markdown
# The State of Web Performance in 2026

Web performance has become critical for user experience and SEO.
[Google's Core Web Vitals](https://web.dev/vitals/) measure three key metrics:
- Largest Contentful Paint (LCP): visual completeness
- Cumulative Layout Shift (CLS): stability
- Interaction to Next Paint (INP): responsiveness

Performance improvements can increase conversions by up to 7%.
[See Shopify's case study](https://shopify.engineering/a-study-of-web-workers).

## Recommended Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
  (Google's audit tool)
- [WebPageTest](https://www.webpagetest.org/)
  (Independent testing)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
  (Built-in profiling)
```

## Red Flags for Unsourced Claims

⚠️ **Watch for**:
- "Studies show..." without link
- "Industry experts agree..." without quotes
- "It's widely known that..." without proof
- "Some people say..." (opinion, not fact)
- Exact numbers without source (growth rates, statistics)

## Integration with Agent

When the agent researches or generates content:
1. **Make claim**: "X has Y property"
2. **Find source**: Search for authoritative reference
3. **Include link**: Inline in response
4. **Flag opinions**: "In my view..." vs "According to [source]..."
5. **Verify**: Would a user trust this without sources?

### Agent Behavior
```
User: "What's the latest in AI agents?"

Agent RESEARCH MODE:
1. Search for recent announcements
2. Find official sources (OpenAI, Anthropic, DeepMind blogs)
3. Cite each claim with link
4. Flag opinions as such

Agent OUTPUT:
"Recent developments in AI agents:

- OpenAI released GPT-4 with multimodal capabilities 
  [Blog post](https://openai.com/research/gpt-4)
  
- Anthropic introduced Constitutional AI for safety
  [Research paper](https://arxiv.org/abs/2212.08073)
  
- In my opinion, agentic reasoning is the next frontier,
  based on progress from DeepMind's AlphaCode.
  [Paper link](https://arxiv.org/abs/2203.07814)"
```

## Quality Checklist

- [ ] Every factual claim has a source
- [ ] Sources are authoritative (not random blogs)
- [ ] Links are clickable and recent (not 404s)
- [ ] Opinions are flagged as such ("In my view...")
- [ ] Quotes include context and attribution
- [ ] Numbers/statistics have sources
- [ ] No vague phrases ("studies show", "experts agree")

## Benefits

✅ **Trust**: Readers can verify claims
✅ **Accuracy**: Forces fact-checking before claiming
✅ **Accountability**: Clear record of where info came from
✅ **Learning**: Reader can dig deeper if interested
