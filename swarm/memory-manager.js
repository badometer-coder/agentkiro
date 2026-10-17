import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Hybrid Memory System for Agent Swarm
 * - File-based: Current session state (fast)
 * - Supabase: Long-term persistence (queryable)
 * - Vectors: Semantic search & learning (future)
 */

class MemoryManager {
  constructor(env) {
    this.env = env;
    this.memoryDir = './swarm/memory';
    this.sessionFile = path.join(this.memoryDir, 'session.json');
    this.learningsFile = path.join(this.memoryDir, 'learnings.json');
    
    // Supabase REST API config (no realtime issues)
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_ADMIN_KEY;
    
    // Ensure memory directory exists
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    
    // Load or initialize session memory
    this.sessionMemory = this.loadSessionMemory();
    this.learnings = this.loadLearnings();
    
    console.log('📚 Memory Manager initialized (REST API mode)');
  }

  /**
   * FILE-BASED MEMORY - Current Session
   */
  
  loadSessionMemory() {
    if (fs.existsSync(this.sessionFile)) {
      try {
        const data = fs.readFileSync(this.sessionFile, 'utf-8');
        return JSON.parse(data);
      } catch (e) {
        console.error('Error loading session memory:', e.message);
      }
    }
    
    return {
      sessionStart: new Date().toISOString(),
      tasksCompleted: [],
      tasksFailed: [],
      conversationHistory: [],
      agentDecisions: {},
    };
  }

  saveSessionMemory() {
    fs.writeFileSync(this.sessionFile, JSON.stringify(this.sessionMemory, null, 2));
  }

  loadLearnings() {
    if (fs.existsSync(this.learningsFile)) {
      try {
        const data = fs.readFileSync(this.learningsFile, 'utf-8');
        return JSON.parse(data);
      } catch (e) {
        console.error('Error loading learnings:', e.message);
      }
    }
    
    return {
      patterns: {},
      bestPractices: [],
      antiPatterns: [],
      successRate: {},
    };
  }

  saveLearnings() {
    fs.writeFileSync(this.learningsFile, JSON.stringify(this.learnings, null, 2));
  }

  /**
   * SUPABASE - Long-term Persistence (REST API)
   */
  
  async saveTaskToDatabase(task) {
    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/agent_tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_name: task.name,
          task_description: task.description,
          status: task.status,
          result: task.result,
          revisions: task.revisions || 0,
          provider_used: task.provider,
          tokens_used: task.tokensUsed || 0,
          execution_time: task.executionTime,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error('Error saving to Supabase:', response.statusText);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Database error:', e.message);
      return false;
    }
  }

  async getTaskHistory(limit = 10) {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/agent_tasks?order=timestamp.desc&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey,
          },
        }
      );

      if (!response.ok) return [];

      return await response.json();
    } catch (e) {
      console.error('Database error:', e.message);
      return [];
    }
  }

  async getSuccessRate() {
    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/agent_tasks`, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        },
      });

      if (!response.ok) return null;

      const data = await response.json();
      const completed = data.filter(t => t.status === 'completed').length;
      const total = data.length;

      return total > 0 ? (completed / total) * 100 : 0;
    } catch (e) {
      return null;
    }
  }

  /**
   * SESSION MEMORY - Add records
   */

  recordConversation(user, bot, intent = null) {
    this.sessionMemory.conversationHistory.push({
      timestamp: new Date().toISOString(),
      user,
      bot,
      intent,
    });
    this.saveSessionMemory();
  }

  recordTaskCompletion(task, success, result = null, provider = null, revisions = 0) {
    const record = {
      name: task.substring(0, 100),
      status: success ? 'completed' : 'failed',
      result: result ? result.substring(0, 500) : null,
      provider: provider,
      revisions: revisions,
      timestamp: new Date().toISOString(),
    };

    if (success) {
      this.sessionMemory.tasksCompleted.push(record);
    } else {
      this.sessionMemory.tasksFailed.push(record);
    }

    // Also save to database for long-term storage
    this.saveTaskToDatabase(record);
    this.saveSessionMemory();

    // Auto-analyze patterns after each task (self-improvement)
    this.analyzePatterns();
  }

  recordAgentDecision(agentName, decision, reasoning) {
    this.sessionMemory.agentDecisions[agentName] = {
      lastDecision: decision,
      reasoning: reasoning,
      timestamp: new Date().toISOString(),
    };
    this.saveSessionMemory();
  }

  /**
   * LEARNINGS - Extract patterns
   */

  async analyzePatterns() {
    // Analyze what works and what doesn't
    const totalCompleted = this.sessionMemory.tasksCompleted.length;
    const totalFailed = this.sessionMemory.tasksFailed.length;
    const total = totalCompleted + totalFailed;

    if (total === 0) return;

    const successRate = (totalCompleted / total) * 100;

    // Store patterns
    this.learnings.successRate = {
      current: successRate,
      updated: new Date().toISOString(),
    };

    // Identify best practices from successful tasks
    const successfulPatterns = this.sessionMemory.tasksCompleted
      .filter(t => t.result)
      .map(t => ({
        pattern: t.name.substring(0, 50),
        provider: t.provider,
        revisions: t.revisions,
      }));

    this.learnings.bestPractices = successfulPatterns.slice(0, 10);

    // Identify anti-patterns from failed tasks
    const failedPatterns = this.sessionMemory.tasksFailed
      .map(t => ({
        pattern: t.name.substring(0, 50),
        reason: 'Needs investigation',
      }));

    this.learnings.antiPatterns = failedPatterns.slice(0, 10);

    this.saveLearnings();

    console.log(`📊 Patterns analyzed: ${successRate.toFixed(1)}% success rate`);
  }

  /**
   * LEARNINGS - Get formatted string for LLM prompt
   */

  getLearningsForPrompt() {
    const parts = [];

    if (this.learnings.antiPatterns && this.learnings.antiPatterns.length > 0) {
      parts.push('PAST MISTAKES TO AVOID (learned from previous failures):');
      for (const ap of this.learnings.antiPatterns.slice(-5)) {
        parts.push(`- ${ap.pattern}${ap.reason ? ` — ${ap.reason}` : ''}`);
      }
    }

    if (this.learnings.bestPractices && this.learnings.bestPractices.length > 0) {
      parts.push('\nPAST SUCCESSES (what worked before):');
      for (const bp of this.learnings.bestPractices.slice(-5)) {
        parts.push(`- ${bp.pattern} (provider: ${bp.provider || 'unknown'}, revisions: ${bp.revisions || 0})`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * Record an anti-pattern (mistake to avoid in future)
   */
  recordAntiPattern(pattern, reason) {
    if (!this.learnings.antiPatterns) this.learnings.antiPatterns = [];
    // Avoid duplicates
    const exists = this.learnings.antiPatterns.find(ap => ap.pattern === pattern);
    if (!exists) {
      this.learnings.antiPatterns.push({
        pattern,
        reason,
        timestamp: new Date().toISOString(),
      });
      // Keep last 20
      this.learnings.antiPatterns = this.learnings.antiPatterns.slice(-20);
      this.saveLearnings();
      console.log(`📝 Recorded anti-pattern: ${pattern}`);
    }
  }

  /**
   * Record a best practice (what worked)
   */
  recordBestPractice(pattern, provider = null) {
    if (!this.learnings.bestPractices) this.learnings.bestPractices = [];
    this.learnings.bestPractices.push({
      pattern,
      provider,
      timestamp: new Date().toISOString(),
    });
    this.learnings.bestPractices = this.learnings.bestPractices.slice(-20);
    this.saveLearnings();
  }

  /**
   * RETRIEVAL - Get relevant memories
   */

  getRelevantMemories(query, limit = 5) {
    // Find conversations and decisions related to query
    const relevant = {
      conversations: this.sessionMemory.conversationHistory
        .filter(c => c.user.includes(query) || c.bot.includes(query))
        .slice(-limit),
      decisions: Object.entries(this.sessionMemory.agentDecisions)
        .filter(([_, d]) => d.reasoning.includes(query))
        .map(([agent, decision]) => ({ agent, ...decision }))
        .slice(-limit),
      learnings: this.learnings.bestPractices.filter(p => p.pattern.includes(query)),
    };

    return relevant;
  }

  /**
   * STATS - Get memory stats
   */

  getStats() {
    return {
      sessionStart: this.sessionMemory.sessionStart,
      tasksCompleted: this.sessionMemory.tasksCompleted.length,
      tasksFailed: this.sessionMemory.tasksFailed.length,
      conversationTurns: this.sessionMemory.conversationHistory.length,
      successRate: this.learnings.successRate,
      lastBestPractices: this.learnings.bestPractices.slice(0, 3),
    };
  }

  /**
   * EXPORT - Save session to database
   */

  async exportSessionToDatabase() {
    try {
      const stats = this.getStats();
      
      const response = await fetch(`${this.supabaseUrl}/rest/v1/agent_sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_start: this.sessionMemory.sessionStart,
          session_end: new Date().toISOString(),
          tasks_completed: stats.tasksCompleted,
          tasks_failed: stats.tasksFailed,
          conversation_turns: stats.conversationTurns,
          success_rate: stats.successRate?.current || 0,
          metadata: JSON.stringify(stats),
        }),
      });

      if (!response.ok) {
        console.error('Error exporting session:', response.statusText);
        return false;
      }

      console.log('✅ Session exported to database');
      return true;
    } catch (e) {
      console.error('Export error:', e.message);
      return false;
    }
  }
}

export default MemoryManager;
