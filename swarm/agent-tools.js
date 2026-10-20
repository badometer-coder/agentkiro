/**
 * Agent Tool System — GitHub API based
 * All file operations go directly through GitHub API. No local clone needed.
 */

import WebSearch from './web-search.js';
import { execSync } from 'child_process';

const GITHUB_REPO  = 'badometer-coder/proximity-app';
const GITHUB_BRANCH = 'main';

export class AgentTools {
  constructor(env, memoryManager) {
    this.env    = env;
    this.memory = memoryManager;
    this.token  = env.GITHUB_TOKEN;
    this.repo   = GITHUB_REPO;
    this.branch = GITHUB_BRANCH;
    this.tools  = this.defineTools();
  }

  // ── GitHub API helpers ─────────────────────────────────────

  async githubGet(filePath) {
    const fetch = (await import('node-fetch')).default;
    const url = `https://api.github.com/repos/${this.repo}/contents/${filePath}?ref=${this.branch}`;
    const res = await fetch(url, {
      headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`GitHub GET ${filePath}: ${res.status}`);
    return res.json();
  }

  async githubPut(filePath, content, message, sha) {
    const fetch = (await import('node-fetch')).default;
    const body = { message, content: Buffer.from(content).toString('base64'), branch: this.branch };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${this.repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub PUT ${filePath}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // ── Tool implementations ───────────────────────────────────

  async readFile(filePath) {
    if (!this.token) return '❌ GITHUB_TOKEN not set';
    try {
      const data    = await this.githubGet(filePath);
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return content.split('\n').map((l, i) => `${i + 1}|${l}`).join('\n');
    } catch (err) {
      return `❌ read_file failed: ${err.message}`;
    }
  }

  async writeFile(filePath, content, message) {
    if (!this.token) return '❌ GITHUB_TOKEN not set';
    try {
      let sha;
      try { sha = (await this.githubGet(filePath)).sha; } catch (_) {}
      await this.githubPut(filePath, content, message || `AI: update ${filePath}`, sha);
      return `✅ Written and pushed to GitHub: ${filePath}`;
    } catch (err) {
      return `❌ write_file failed: ${err.message}`;
    }
  }

  async patchFile(filePath, oldString, newString) {
    if (!this.token) return '❌ GITHUB_TOKEN not set';
    try {
      const data    = await this.githubGet(filePath);
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      
      if (!content.includes(oldString)) {
        // Provide diagnostic help
        const lines = content.split('\n');
        const searchWords = oldString.split(/\s+/).filter(w => w.length > 3);
        const matchingLines = [];
        
        for (let i = 0; i < lines.length; i++) {
          if (searchWords.some(w => lines[i].includes(w))) {
            matchingLines.push(`Line ${i+1}: ${lines[i].substring(0, 120)}`);
          }
        }
        
        const diagnostic = matchingLines.length > 0 
          ? `\n\nPossible lines:\n${matchingLines.slice(0, 3).join('\n')}`
          : '\n\nHint: Read the file again and copy the EXACT text (including whitespace and newlines).';
        
        return `❌ old_string not found in ${filePath}.${diagnostic}`;
      }
      
      const updated = content.replace(oldString, newString);
      await this.githubPut(filePath, updated, `AI: patch ${filePath}`, data.sha);
      return `✅ Patched and pushed to GitHub: ${filePath}`;
    } catch (err) {
      return `❌ patch failed: ${err.message}`;
    }
  }

  async searchWeb(query) {
    try {
      return await WebSearch.search(query) || 'No results found.';
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  }

  async remember(type, content) {
    try {
      if (type === 'pattern') this.memory.recordBestPractice(content, 'agent');
      else if (type === 'antipattern') this.memory.recordAntiPattern(content, 'agent');
      return `✅ Remembered: ${content.substring(0, 80)}`;
    } catch (err) {
      return `Failed to remember: ${err.message}`;
    }
  }

  getTime() { return new Date().toLocaleTimeString('en-US'); }
  getDate() { return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  getMemoryStats() {
    try { return JSON.stringify(this.memory.getStats(), null, 2); }
    catch (_) { return 'Memory stats unavailable'; }
  }

  // ── Tool registry ──────────────────────────────────────────

  defineTools() {
    return {
      read_file: {
        description: 'Read a file from GitHub repo. Returns content with line numbers.',
        execute: async (p) => this.readFile(p.path),
      },
      write_file: {
        description: 'Write/create a file in GitHub repo. Auto-commits and pushes.',
        execute: async (p) => this.writeFile(p.path, p.content, p.message),
      },
      patch: {
        description: 'Find old_string in a file and replace with new_string. Auto-commits and pushes.',
        execute: async (p) => this.patchFile(p.path, p.old_string, p.new_string),
      },
      web_search: {
        description: 'Search the web for documentation or solutions.',
        execute: async (p) => this.searchWeb(p.query),
      },
      remember: {
        description: 'Save a learning to memory.',
        execute: async (p) => this.remember(p.type, p.content),
      },
      get_time:     { execute: async () => this.getTime() },
      get_date:     { execute: async () => this.getDate() },
      memory_stats: { execute: async () => this.getMemoryStats() },
    };
  }

  // ── Tool executor ──────────────────────────────────────────

  async executeTool(toolName, params) {
    const tool = this.tools[toolName];
    if (!tool) return `❌ Unknown tool: ${toolName}. Available: ${Object.keys(this.tools).join(', ')}`;
    try {
      return await tool.execute(params || {});
    } catch (err) {
      return `❌ Tool ${toolName} error: ${err.message}`;
    }
  }
}

export default AgentTools;
