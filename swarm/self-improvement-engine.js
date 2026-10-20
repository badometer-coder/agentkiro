import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, 'skills');
const LEARNING_LOG = path.join(__dirname, 'memory', 'learning.json');

/**
 * Self-Improvement Engine: Learns from complex tasks and writes new skills
 * 
 * How it works:
 * 1. Track tool calls per task (session log)
 * 2. If task involved 5+ tool calls, candidate for skill creation
 * 3. Extract workflow pattern from tool sequence
 * 4. Write new skill markdown with pattern + examples
 * 5. Index skill in memory for future use
 * 6. Next time similar task appears, load skill instead of rediscovering
 * 
 * This is Hermes' "closed learning loop"
 */
class SelfImprovementEngine {
  constructor() {
    this.sessionLog = [];
    this.learningHistory = this.loadLearningHistory();
  }

  /**
   * Log a tool call (agent.js calls this after each tool execution)
   * 
   * Example:
   *   engine.logToolCall({
   *     toolName: 'read_file',
   *     input: { path: 'src/login.tsx' },
   *     output: '...',
   *     timestamp: Date.now()
   *   })
   */
  logToolCall(call) {
    this.sessionLog.push({
      tool: call.toolName,
      input: call.input,
      timestamp: call.timestamp || Date.now(),
      success: !call.error,
    });

    console.log(`📝 Logged: ${call.toolName} (${this.sessionLog.length} calls so far)`);
  }

  /**
   * Mark end of task and evaluate if skill should be created
   */
  async endTask(taskDescription, result, success = true) {
    const numCalls = this.sessionLog.length;
    const duration = Date.now() - (this.sessionLog[0]?.timestamp || Date.now());

    console.log(`\n🎯 Task ended: "${taskDescription}"`);
    console.log(`   Tool calls: ${numCalls}`);
    console.log(`   Duration: ${Math.round(duration / 1000)}s`);
    console.log(`   Success: ${success}`);

    // Evaluate if this should become a skill
    const shouldCreateSkill = this.evaluateForSkillCreation(taskDescription, numCalls, success);

    if (shouldCreateSkill) {
      console.log(`\n✨ CANDIDATE FOR SKILL CREATION`);
      const skill = await this.generateSkill(taskDescription, result);
      
      if (skill) {
        console.log(`✅ Skill created: ${skill.title}`);
        console.log(`   File: ${skill.filePath}`);
        this.recordLearning(taskDescription, skill);
      }
    } else {
      console.log(`   (Not complex enough for skill creation — need 5+ tools)`);
    }

    // Clear for next task
    this.sessionLog = [];
  }

  /**
   * Evaluate if task complexity warrants skill creation
   * 
   * Criteria:
   * - Must have 5+ tool calls (meaningful sequence)
   * - Must be successful (no point learning from failures)
   * - Tool variety (multiple types of tools, not just reads)
   */
  evaluateForSkillCreation(taskDescription, numCalls, success) {
    if (numCalls < 5) return false;
    if (!success) return false;

    // Check tool variety (at least 2 different tool types)
    const uniqueTools = new Set(this.sessionLog.map(c => c.tool));
    if (uniqueTools.size < 2) {
      console.log(`   (Skill skipped: only ${uniqueTools.size} unique tool type(s): ${[...uniqueTools].join(', ')})`);
      return false;
    }

    return true;
  }

  /**
   * Generate a skill markdown file from the task
   */
  async generateSkill(taskDescription, result) {
    try {
      // Extract workflow from tool sequence
      const workflow = this.extractWorkflow();
      
      // Build skill metadata
      const skillName = this.generateSkillName(taskDescription);
      const skillTitle = this.generateSkillTitle(taskDescription);
      const category = this.inferCategory(taskDescription);
      const triggers = this.extractTriggers(taskDescription, this.sessionLog);

      // Calculate token estimate
      const tokens = Math.round((result?.length || 0) / 4); // rough estimate

      // Build markdown skill
      const skillMarkdown = this.buildSkillMarkdown({
        title: skillTitle,
        category,
        triggers,
        tokens,
        workflow,
        taskDescription,
        toolSequence: this.sessionLog,
      });

      // Write to disk
      const filePath = path.join(SKILLS_DIR, `${skillName}.md`);
      fs.writeFileSync(filePath, skillMarkdown, 'utf-8');

      return {
        title: skillTitle,
        name: skillName,
        filePath,
        category,
        triggers,
        workflow,
      };
    } catch (err) {
      console.error(`❌ Failed to generate skill:`, err.message);
      return null;
    }
  }

  /**
   * Extract workflow pattern from tool sequence
   */
  extractWorkflow() {
    const workflow = [];
    
    this.sessionLog.forEach((call, i) => {
      const step = `${i + 1}. **${this.humanizeToolName(call.tool)}**`;
      const desc = this.describeToolStep(call.tool, call.input);
      workflow.push(`${step}: ${desc}`);
    });

    return workflow;
  }

  /**
   * Convert tool name to human-readable form
   */
  humanizeToolName(toolName) {
    return toolName
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Describe what a tool step does
   */
  describeToolStep(toolName, input) {
    switch (toolName) {
      case 'read_file':
        return `Read ${input?.path || 'file'} to understand structure`;
      case 'write_file':
        return `Create ${input?.path || 'new file'} with implementation`;
      case 'patch':
        return `Targeted edit to fix issue or add feature`;
      case 'terminal':
        return `Run ${input?.command || 'command'} to validate/test`;
      case 'web_search':
        return `Search for docs/patterns: "${input?.query || 'topic'}"`;
      default:
        return `Execute ${toolName}`;
    }
  }

  /**
   * Generate skill file name from task
   */
  generateSkillName(taskDescription) {
    // Extract key noun + verb: "add dark mode" → "add-dark-mode"
    const cleaned = taskDescription
      .toLowerCase()
      .split(' ')
      .slice(0, 3)
      .join('-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    return cleaned || 'learned-skill';
  }

  /**
   * Generate human-readable skill title
   */
  generateSkillTitle(taskDescription) {
    return taskDescription.charAt(0).toUpperCase() + taskDescription.slice(1);
  }

  /**
   * Infer category from task description
   */
  inferCategory(taskDescription) {
    const lower = taskDescription.toLowerCase();
    
    if (lower.includes('test') || lower.includes('debug')) return 'software-development';
    if (lower.includes('github') || lower.includes('commit') || lower.includes('pr')) return 'software-development';
    if (lower.includes('research') || lower.includes('search')) return 'research';
    if (lower.includes('design') || lower.includes('ui') || lower.includes('component')) return 'creative';
    if (lower.includes('database') || lower.includes('deploy')) return 'devops';
    
    return 'software-development'; // default
  }

  /**
   * Extract trigger keywords from task + tool sequence
   */
  extractTriggers(taskDescription, toolSequence) {
    const triggers = new Set();

    // Extract words from task description (nouns + verbs)
    const words = taskDescription
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'into'].includes(w));

    words.slice(0, 3).forEach(w => triggers.add(w));

    // Extract from tool types used
    const tools = new Set(toolSequence.map(c => c.tool));
    if (tools.has('write_file') || tools.has('patch')) triggers.add('code');
    if (tools.has('web_search')) triggers.add('research');
    if (tools.has('terminal')) triggers.add('test');

    return Array.from(triggers);
  }

  /**
   * Build the markdown skill file content
   */
  buildSkillMarkdown(opts) {
    const { title, category, triggers, tokens, workflow, taskDescription, toolSequence } = opts;

    let md = `---
title: ${title}
category: ${category}
triggers: [${triggers.map(t => `"${t}"`).join(', ')}]
tokens: ${tokens}
auto_generated: true
created_at: ${new Date().toISOString()}
---

## Overview

This skill was automatically generated by the agent's self-improvement engine after completing the task:
**"${taskDescription}"**

The agent used a sequence of ${toolSequence.length} tool calls to solve this problem. This workflow can be reused for similar future tasks.

## Pattern / Workflow

${workflow.map(w => `- ${w}`).join('\n')}

## How to Use

When you encounter a similar task, the agent will:
1. Recognize the pattern from your description
2. Load this skill
3. Follow the workflow above
4. Adapt tool parameters to your specific case

## Example

Original task that created this skill:
\`\`\`
${taskDescription}
\`\`\`

The agent executed these steps:
${toolSequence.map((c, i) => `${i + 1}. ${c.tool}: ${JSON.stringify(c.input).substring(0, 60)}...`).join('\n')}

## When This Skill Loads

The agent will automatically load this skill when:
- Your message contains any of: ${triggers.join(', ')}
- Task complexity warrants it (5+ steps)

## Notes

- This skill was auto-generated. Manual review and refinement recommended.
- If this skill doesn't quite match your workflow, edit it! Skills are plain markdown.
- The agent learns from successful patterns, so this skill will improve over time.
`;

    return md;
  }

  /**
   * Load past learning history
   */
  loadLearningHistory() {
    try {
      if (fs.existsSync(LEARNING_LOG)) {
        const data = JSON.parse(fs.readFileSync(LEARNING_LOG, 'utf-8'));
        console.log(`📚 Loaded ${data.length} past learning events`);
        return data;
      }
    } catch (e) {
      console.log(`⚠️ Could not load learning history: ${e.message}`);
    }
    return [];
  }

  /**
   * Record a skill creation event in history
   */
  recordLearning(taskDescription, skill) {
    const event = {
      timestamp: Date.now(),
      task: taskDescription,
      skillName: skill.name,
      skillTitle: skill.title,
      category: skill.category,
      toolCount: this.sessionLog.length,
    };

    this.learningHistory.push(event);

    // Persist to disk
    try {
      const dir = path.dirname(LEARNING_LOG);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(LEARNING_LOG, JSON.stringify(this.learningHistory, null, 2), 'utf-8');
    } catch (e) {
      console.log(`⚠️ Failed to save learning history: ${e.message}`);
    }
  }

  /**
   * Get stats on learning progress
   */
  getStats() {
    const total = this.learningHistory.length;
    const byCategory = {};
    
    this.learningHistory.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    });

    const avgToolsPerSkill = this.learningHistory.length > 0
      ? Math.round(this.learningHistory.reduce((sum, e) => sum + e.toolCount, 0) / total)
      : 0;

    return {
      totalSkillsLearned: total,
      byCategory,
      avgToolsPerSkill,
      recentSkills: this.learningHistory.slice(-5).reverse(),
    };
  }

  /**
   * Get learning insights (what the agent has learned)
   */
  getInsights() {
    const stats = this.getStats();
    
    let msg = `🧠 AGENT LEARNING STATS\n\n`;
    msg += `✨ Skills created: ${stats.totalSkillsLearned}\n`;
    msg += `📊 Avg tools per skill: ${stats.avgToolsPerSkill}\n\n`;
    
    if (Object.keys(stats.byCategory).length > 0) {
      msg += `By category:\n`;
      Object.entries(stats.byCategory).forEach(([cat, count]) => {
        msg += `  • ${cat}: ${count} skill(s)\n`;
      });
    }

    if (stats.recentSkills.length > 0) {
      msg += `\n📚 Recent skills:\n`;
      stats.recentSkills.forEach(s => {
        msg += `  • ${s.skillTitle}\n`;
      });
    }

    return msg;
  }
}

export default SelfImprovementEngine;
