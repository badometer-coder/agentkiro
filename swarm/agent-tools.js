/**
 * Agent Tool System — Hermes-style coding tools
 * Tools: read_file, write_file, patch, terminal, web_search, remember, recall, get_time, get_date, memory_stats
 */

import WebSearch from './web-search.js';
import MemoryManager from './memory-manager.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class AgentTools {
  constructor(env, memoryManager) {
    this.env = env;
    this.memory = memoryManager;
    this.webSearch = WebSearch;
    this.projectPath = env.PROJECT_PATH || process.cwd();
    this.tools = this.defineTools();
  }

  defineTools() {
    return {
      // === CODING TOOLS (Hermes-style) ===
      read_file: {
        description: 'Read a file from the project. Returns content with line numbers. Use this to see existing code before editing.',
        parameters: {
          path: { type: 'string', description: 'File path relative to project root (e.g. "src/screens/auth/LoginScreen.tsx")' },
          offset: { type: 'number', description: 'Line to start reading from (default 1)', },
          limit: { type: 'number', description: 'Max lines to read (default 200, max 2000)' },
        },
        execute: async (p) => this.readFile(p.path, p.offset, p.limit)
      },

      write_file: {
        description: 'Write content to a file, completely replacing existing content. Creates the file if it does not exist.',
        parameters: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Complete file content to write' },
        },
        execute: async (p) => this.writeFile(p.path, p.content)
      },

      patch: {
        description: 'Make a targeted find-and-replace edit in a file. Finds old_string and replaces with new_string. Use this instead of rewriting the whole file.',
        parameters: {
          path: { type: 'string', description: 'File path relative to project root' },
          old_string: { type: 'string', description: 'Exact text to find (include surrounding context for uniqueness)' },
          new_string: { type: 'string', description: 'Replacement text (use empty string to delete)' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
        },
        execute: async (p) => this.patchFile(p.path, p.old_string, p.new_string, p.replace_all)
      },

      terminal: {
        description: 'Run a shell command in the project directory. Use for running tests, installing packages, git operations, etc.',
        parameters: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in seconds (default 30, max 120)' },
        },
        execute: async (p) => this.runTerminal(p.command, p.timeout)
      },

      // === WEB / MEMORY TOOLS ===
      web_search: {
        description: 'Search the web for documentation, current news, or solutions',
        parameters: {
          query: { type: 'string', description: 'Search query' }
        },
        execute: async (p) => this.searchWeb(p.query)
      },

      remember: {
        description: 'Save a learning or pattern to memory',
        parameters: {
          type: { type: 'string', enum: ['pattern', 'solution', 'antipattern', 'insight'] },
          content: { type: 'string', description: 'What to remember' }
        },
        execute: async (p) => this.remember(p.type, p.content)
      },

      recall: {
        description: 'Recall learnings from memory on a topic',
        parameters: {
          topic: { type: 'string', description: 'Topic to recall' }
        },
        execute: async (p) => this.recall(p.topic)
      },

      get_time: {
        description: 'Get current time',
        parameters: {},
        execute: async () => this.getTime()
      },

      get_date: {
        description: 'Get current date',
        parameters: {},
        execute: async () => this.getDate()
      },

      memory_stats: {
        description: 'Get memory statistics',
        parameters: {},
        execute: async () => this.getMemoryStats()
      },
    };
  }

  // ============================================================
  // CODING TOOLS — match Hermes behavior
  // ============================================================

  /**
   * Read a file with line numbers (Hermes format: LINE_NUM|CONTENT)
   */
  async readFile(filePath, offset = 1, limit = 200) {
    try {
      const fullPath = path.resolve(this.projectPath, filePath);
      if (!fs.existsSync(fullPath)) {
        return `File not found: ${filePath}`;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, (offset || 1) - 1);
      const end = Math.min(lines.length, start + (limit || 200));

      const numbered = lines.slice(start, end)
        .map((line, i) => `${start + i + 1}|${line}`)
        .join('\n');

      return numbered || '(empty file)';
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  }

  /**
   * Write a file (creates or overwrites)
   */
  async writeFile(filePath, content) {
    try {
      const fullPath = path.resolve(this.projectPath, filePath);
      const dir = path.dirname(fullPath);

      // Create directories if needed
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content || '', 'utf-8');
      const lines = (content || '').split('\n').length;
      return `✅ Wrote ${lines} lines to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  }

  /**
   * Patch a file — find and replace with fuzzy matching
   */
  async patchFile(filePath, oldString, newString, replaceAll = false) {
    try {
      const fullPath = path.resolve(this.projectPath, filePath);
      if (!fs.existsSync(fullPath)) {
        return `File not found: ${filePath}`;
      }

      if (!oldString) {
        return `old_string is required`;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');

      // Try exact match first
      let matchCount = 0;
      let idx = content.indexOf(oldString);
      while (idx !== -1) {
        matchCount++;
        idx = content.indexOf(oldString, idx + 1);
      }

      if (matchCount === 0) {
        // Fuzzy match — normalize whitespace
        const normalizedContent = content.replace(/\s+/g, ' ');
        const normalizedOld = oldString.replace(/\s+/g, ' ');
        const fuzzyIdx = normalizedContent.indexOf(normalizedOld);
        if (fuzzyIdx === -1) {
          return `❌ old_string not found in ${filePath}. Read the file first to get exact text.`;
        }
        // Can't do precise fuzzy replace easily, fall back to normalized replace
        const newContent = normalizedContent.split(normalizedOld).join(newString || '');
        fs.writeFileSync(fullPath, newContent, 'utf-8');
        return `✅ Patched ${filePath} (fuzzy match)`;
      }

      if (matchCount > 1 && !replaceAll) {
        return `❌ old_string found ${matchCount} times in ${filePath}. Add more context to make it unique, or set replace_all=true.`;
      }

      // Do the replacement
      let newContent;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString || '');
      } else {
        newContent = content.replace(oldString, newString || '');
      }

      fs.writeFileSync(fullPath, newContent, 'utf-8');
      return `✅ Patched ${filePath} (${matchCount} replacement${matchCount > 1 ? 's' : ''})`;
    } catch (err) {
      return `Error patching file: ${err.message}`;
    }
  }

  /**
   * Run a terminal command
   */
  async runTerminal(command, timeout = 30) {
    if (!command) return 'No command provided';

    try {
      const maxTimeout = Math.min(timeout || 30, 120) * 1000;
      const output = execSync(command, {
        cwd: this.projectPath,
        encoding: 'utf-8',
        timeout: maxTimeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024, // 1MB
      });
      return output.substring(0, 5000) || '(command completed, no output)';
    } catch (err) {
      const output = String(err.stdout || err.stderr || err.message || '');
      return `Command failed (exit ${err.status || 'unknown'}):\n${output.substring(0, 5000)}`;
    }
  }

  // ============================================================
  // WEB / MEMORY TOOLS
  // ============================================================

  async searchWeb(query) {
    if (!query || query.length < 2) {
      return 'Query too short.';
    }
    try {
      console.log(`🔍 Agent tool: searching web for "${query}"`);
      const results = await this.webSearch.search(query);
      return results || 'No results found.';
    } catch (error) {
      return `Search failed: ${error.message}`;
    }
  }

  async remember(type, content) {
    try {
      if (type === 'pattern') this.memory.recordBestPractice(content, 'agent');
      else if (type === 'antipattern') this.memory.recordAntiPattern(content, 'learned from experience');
      else if (type === 'solution') this.memory.recordTaskCompletion(content, true, null, 'agent', 0);
      else if (type === 'insight') this.memory.recordBestPractice(`Insight: ${content}`, 'agent');
      return `✅ Remembered: ${(content || '').substring(0, 100)}...`;
    } catch (error) {
      return `Failed to remember: ${error.message}`;
    }
  }

  async recall(topic) {
    try {
      const stats = this.memory.getStats();
      if (!stats || !stats.learnings) return `No learnings found for "${topic}".`;
      const relevant = stats.learnings.filter(l => l.toLowerCase().includes(topic.toLowerCase())).slice(0, 3);
      if (relevant.length === 0) return `No learnings found for "${topic}".`;
      return `📚 Recalled learnings on "${topic}":\n\n${relevant.join('\n\n')}`;
    } catch (error) {
      return `Failed to recall: ${error.message}`;
    }
  }

  async getTime() {
    const now = new Date();
    try {
      const r = await fetch('https://worldtimeapi.org/api/ip', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        const dt = new Date(d.datetime);
        return `Current time: ${dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} (${d.timezone || 'UTC'})`;
      }
    } catch (_) {}
    return `Current time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} (local)`;
  }

  async getDate() {
    const now = new Date();
    try {
      const r = await fetch('https://worldtimeapi.org/api/ip', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        const dt = new Date(d.datetime);
        return `Today is ${dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (${d.timezone || 'UTC'})`;
      }
    } catch (_) {}
    return `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (local)`;
  }

  getMemoryStats() {
    try {
      const stats = this.memory.getStats();
      return `📊 Memory: ${stats.totalTasks || 0} tasks, ${stats.bestPractices?.length || 0} patterns, ${stats.antiPatterns?.length || 0} antipatterns`;
    } catch (error) {
      return `Failed: ${error.message}`;
    }
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName, params) {
    const tool = this.tools[toolName];
    if (!tool) return `Unknown tool: ${toolName}`;
    try {
      return await tool.execute(params || {});
    } catch (error) {
      return `Tool error: ${error.message}`;
    }
  }
}

export default AgentTools;
