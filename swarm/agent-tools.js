/**
 * Agent Tool System
 * Allows the agent to call tools like web search, memory, code execution, etc.
 */

import WebSearch from './web-search.js';
import MemoryManager from './memory-manager.js';

export class AgentTools {
  constructor(env, memoryManager) {
    this.env = env;
    this.memory = memoryManager;
    this.webSearch = WebSearch;
    this.tools = this.defineTools();
  }

  /**
   * Define all available tools
   */
  defineTools() {
    return {
      web_search: {
        description: 'Search the web for real documentation, API references, solutions, or current information',
        parameters: {
          query: { type: 'string', description: 'Search query (e.g., "react-native useAuth hook", "TypeScript error TS2339 solution")' }
        },
        execute: async (params) => this.searchWeb(params.query)
      },

      remember: {
        description: 'Save a learning or pattern to memory for future reference',
        parameters: {
          type: { type: 'string', enum: ['pattern', 'solution', 'antipattern', 'insight'], description: 'Type of thing to remember' },
          content: { type: 'string', description: 'What to remember' }
        },
        execute: async (params) => this.remember(params.type, params.content)
      },

      recall: {
        description: 'Recall learnings from memory on a specific topic',
        parameters: {
          topic: { type: 'string', description: 'Topic to recall (e.g., "useAuth errors", "dark mode patterns")' }
        },
        execute: async (params) => this.recall(params.topic)
      },

      get_time: {
        description: 'Get current date and time',
        parameters: {},
        execute: async () => this.getTime()
      },

      get_date: {
        description: 'Get current date',
        parameters: {},
        execute: async () => this.getDate()
      },

      memory_stats: {
        description: 'Get memory statistics and learned patterns',
        parameters: {},
        execute: async () => this.getMemoryStats()
      }
    };
  }

  /**
   * Search the web for information
   */
  async searchWeb(query) {
    if (!query || query.length < 2) {
      return 'Query too short. Please provide at least 2 characters.';
    }

    try {
      console.log(`🔍 Agent tool: searching web for "${query}"`);
      const results = await this.webSearch.search(query);
      
      if (!results) {
        return 'No results found. Try a different query.';
      }

      return results;
    } catch (error) {
      return `Search failed: ${error.message}`;
    }
  }

  /**
   * Remember a pattern or solution
   */
  async remember(type, content) {
    try {
      if (type === 'pattern') {
        this.memory.recordBestPractice(content, 'agent');
      } else if (type === 'antipattern') {
        this.memory.recordAntiPattern(content, 'learned from experience');
      } else if (type === 'solution') {
        this.memory.recordTaskCompletion(content, true, null, 'agent', 0);
      } else if (type === 'insight') {
        this.memory.recordBestPractice(`Insight: ${content}`, 'agent');
      }
      
      return `✅ Remembered: ${content.substring(0, 100)}...`;
    } catch (error) {
      return `Failed to remember: ${error.message}`;
    }
  }

  /**
   * Recall learnings on a topic
   */
  async recall(topic) {
    try {
      const stats = this.memory.getStats();
      
      if (!stats || !stats.learnings) {
        return `No learnings found for "${topic}". Start by completing tasks.`;
      }

      const relevant = stats.learnings
        .filter(l => l.toLowerCase().includes(topic.toLowerCase()))
        .slice(0, 3);

      if (relevant.length === 0) {
        return `No learnings found for "${topic}". Try searching web instead.`;
      }

      return `📚 Recalled learnings on "${topic}":\n\n${relevant.join('\n\n')}`;
    } catch (error) {
      return `Failed to recall: ${error.message}`;
    }
  }

  /**
   * Get current time — uses server clock since Render blocks outbound fetch
   */
  async getTime() {
    const now = new Date();
    // Try external API first in case network is available
    try {
      const response = await fetch('https://worldtimeapi.org/api/ip', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = await response.json();
        const dt = new Date(data.datetime);
        const timeStr = dt.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true, timeZone: data.timezone || 'UTC'
        });
        return `Current time: ${timeStr} (${data.timezone || 'UTC'})`;
      }
    } catch (e) { /* network blocked — fall through */ }

    // Fallback: server clock (may be off by timezone but day is usually correct)
    const timeStr = now.toUTCString();
    return `Current time (server UTC): ${timeStr}`;
  }

  /**
   * Get current date — uses server clock since Render blocks outbound fetch
   */
  async getDate() {
    const now = new Date();
    // Try external API first in case network is available
    try {
      const response = await fetch('https://worldtimeapi.org/api/ip', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = await response.json();
        const dt = new Date(data.datetime);
        const dateStr = dt.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          timeZone: data.timezone || 'UTC'
        });
        return `Today is ${dateStr} (${data.timezone || 'UTC'})`;
      }
    } catch (e) { /* network blocked — fall through */ }

    // Fallback: server clock
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'UTC'
    });
    return `Today is ${dateStr} (UTC — server clock)`;
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    try {
      const stats = this.memory.getStats();
      return `📊 Memory Stats:
- Success rate: ${stats.successRate?.current?.toFixed(1) || 'N/A'}%
- Tasks completed: ${stats.totalTasks || 0}
- Best practices learned: ${stats.bestPractices?.length || 0}
- Anti-patterns identified: ${stats.antiPatterns?.length || 0}`;
    } catch (error) {
      return `Failed to get stats: ${error.message}`;
    }
  }

  /**
   * Get tool definitions for LLM (OpenAI format)
   */
  getToolDefinitions() {
    return Object.entries(this.tools).map(([name, tool]) => ({
      type: 'function',
      function: {
        name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          required: Object.keys(tool.parameters)
        }
      }
    }));
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName, params) {
    const tool = this.tools[toolName];
    
    if (!tool) {
      return `Unknown tool: ${toolName}`;
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      return `Tool error: ${error.message}`;
    }
  }
}

export default AgentTools;
