/**
 * Agent Tool System — GitHub API based
 * All file operations go directly through GitHub API. No local clone needed.
 */

import WebSearch from './web-search.js';
import { execSync } from 'child_process';
import fs from 'fs';

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

  async searchLocal(basePath, query) {
    try {
      const { execSync } = await import('child_process');
      // Use ripgrep if available, else grep
      try {
        const out = execSync(`rg -n --no-heading --max-count 5 "${query.replace(/"/g, '\\"')}" "${basePath}" 2>&1 | head -60`, { encoding: 'utf-8', timeout: 15000 });
        if (out && !out.includes('No files were searched')) {
          return `🔍 Local search results for "${query}" in ${basePath}:\n\n${out}`;
        }
      } catch(e) {}
      try {
        const out = execSync(`grep -rn "${query.replace(/"/g, '\\"')}" "${basePath}" 2>&1 | head -60`, { encoding: 'utf-8', timeout: 15000 });
        if (out && !out.includes('No such file')) {
          return `🔍 Local search results for "${query}" in ${basePath}:\n\n${out}`;
        }
      } catch(e) {}
    } catch(e) {}
    return `🔍 No results found for "${query}" in ${basePath}`;
  }

  async searchFiles(query) {
    const localPaths = [
      this.env.PROJECT_PATH,
      process.env.PROJECT_PATH,
      '/Users/owner/proximity-app-final',
      '/opt/render/project/proximity-app',
      '/opt/render/project/src',
      process.cwd().replace('/swarm','')
    ].filter(Boolean);
    for (const base of localPaths) {
      if (fs.existsSync(base)) {
        try {
          const results = await this.searchLocal(base, query);
          if (results && !results.includes('No results found')) {
            return results;
          }
        } catch(e) {}
      }
    }
    if (!this.token) return '❌ GITHUB_TOKEN not set and no local files found';
    try {
      const fetch = (await import('node-fetch')).default;
      // Search code in repo
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(query + ' repo:' + this.repo)}&per_page=10`;
      const res = await fetch(url, {
        headers: { 
          Authorization: `token ${this.token}`, 
          Accept: 'application/vnd.github.v3.text-match+json' 
        },
      });
      if (!res.ok) throw new Error(`GitHub search failed: ${res.status}`);
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        return `🔍 No results found for "${query}" in ${this.repo}`;
      }
      const results = data.items.map((item, i) => {
        const matches = item.text_matches?.map(m => m.fragment).join(' ... ') || '';
        return `${i + 1}. ${item.path}\n   ${matches.substring(0, 200)}`;
      }).join('\n\n');
      return `🔍 Search results for "${query}":\n\n${results}\n\nUse read_file to view full contents.`;
    } catch (err) {
      return `❌ search_files failed: ${err.message}`;
    }
  }

  // ── Tool implementations ───────────────────────────────────

  async readFile(filePath, startLine = 0, maxLines = 60) {
    const pathMod = await import('path');
    const localPaths = [
      this.env.PROJECT_PATH,
      process.env.PROJECT_PATH,
      '/Users/owner/proximity-app-final',
      '/opt/render/project/proximity-app',
      '/opt/render/project/src',
      process.cwd().replace('/swarm','')
    ].filter(Boolean);
    for (const base of localPaths) {
      const full = pathMod.join(base, filePath);
      if (fs.existsSync(full)) {
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const lines = content.split('\n');
          const total = lines.length;
          const slice = lines.slice(startLine, startLine + maxLines);
          const result = slice.map((l, i) => `${startLine + i + 1}|${l}`).join('\n');
          const footer = (startLine + maxLines < total)
            ? `\n\n[File has ${total} lines total. Use read_file with start_line=${startLine + maxLines} to read more.]`
            : `\n\n[End of file — ${total} lines total]`;
          return result + footer;
        } catch(e) {}
      }
    }
    if (!this.token) return '❌ GITHUB_TOKEN not set and no local files found';
    try {
      const data    = await this.githubGet(filePath);
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const lines   = content.split('\n');
      const total   = lines.length;
      const slice   = lines.slice(startLine, startLine + maxLines);
      const result  = slice.map((l, i) => `${startLine + i + 1}|${l}`).join('\n');
      const footer  = (startLine + maxLines < total)
        ? `\n\n[File has ${total} lines total. Use read_file with start_line=${startLine + maxLines} to read more.]`
        : `\n\n[End of file — ${total} lines total]`;
      return result + footer;
    } catch (err) {
      return `❌ read_file failed: ${err.message}`;
    }
  }

  async writeFile(filePath, content, message) {
    const pathMod = await import('path');
    const localPaths = [
      this.env.PROJECT_PATH,
      process.env.PROJECT_PATH,
      '/Users/owner/proximity-app-final',
      '/opt/render/project/proximity-app',
      '/opt/render/project/src',
      process.cwd().replace('/swarm','')
    ].filter(Boolean);
    for (const base of localPaths) {
      const full = pathMod.join(base, filePath);
      const dir = pathMod.dirname(full);
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        let fileContent = content;
        if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
          fileContent = fileContent.replace(
            /import\s+\{([^}]*)SafeAreaView([^}]*)\}\s+from\s+['"]react-native['"]/g,
            (match, before, after) => {
              const cleaned = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'SafeAreaView');
              return `import { ${cleaned.join(', ')} } from 'react-native'`;
            }
          );
          if (fileContent.includes('<SafeAreaView') && !fileContent.includes("from 'react-native-safe-area-context'") && !fileContent.includes('from "react-native-safe-area-context"')) {
            const lines = fileContent.split('\n');
            let lastImportIdx = -1;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith('import ')) lastImportIdx = i;
            }
            if (lastImportIdx >= 0) {
              lines.splice(lastImportIdx + 1, 0, "import { SafeAreaView } from 'react-native-safe-area-context';");
              fileContent = lines.join('\n');
            }
          }
        }
        fs.writeFileSync(full, fileContent, 'utf-8');
        return `✅ Written locally: ${full}`;
      } catch(e) {
        // try next
      }
    }
    if (!this.token) return '❌ GITHUB_TOKEN not set and no local path writable';
    try {
      let sha;
      try { sha = (await this.githubGet(filePath)).sha; } catch (_) {}
      
      // Auto-fix: Replace SafeAreaView from 'react-native' with 'react-native-safe-area-context'
      if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
        content = content.replace(
          /import\s+\{([^}]*)SafeAreaView([^}]*)\}\s+from\s+['"]react-native['"]/g,
          (match, before, after) => {
            const cleaned = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'SafeAreaView');
            return `import { ${cleaned.join(', ')} } from 'react-native'`;
          }
        );
        if (content.includes('<SafeAreaView') && !content.includes("from 'react-native-safe-area-context'") && !content.includes('from "react-native-safe-area-context"')) {
          const lines = content.split('\n');
          let lastImportIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) lastImportIdx = i;
          }
          if (lastImportIdx >= 0) {
            lines.splice(lastImportIdx + 1, 0, "import { SafeAreaView } from 'react-native-safe-area-context';");
            content = lines.join('\n');
          }
        }
      }
      
      // Check for truncated content — common sign of max_tokens being too low
      if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
        const lastLine = content.trim().split('\n').pop().trim();
        if (lastLine && !lastLine.endsWith(';') && !lastLine.endsWith('}') && !lastLine.endsWith('>') && !lastLine.endsWith('*/') && !lastLine.endsWith(']')) {
          console.log(`⚠️ File may be truncated — last line: "${lastLine.substring(0, 50)}"`);
        }
      }
      
      await this.githubPut(filePath, content, message || `AI: update ${filePath}`, sha);
      return `✅ Written and pushed to GitHub: ${filePath}`;
    } catch (err) {
      return `❌ write_file failed: ${err.message}`;
    }
  }

  async patchFile(filePath, oldString, newString) {
    const pathMod = await import('path');
    const localPaths = [
      this.env.PROJECT_PATH,
      process.env.PROJECT_PATH,
      '/Users/owner/proximity-app-final',
      '/opt/render/project/proximity-app',
      '/opt/render/project/src',
      process.cwd().replace('/swarm','')
    ].filter(Boolean);
    for (const base of localPaths) {
      const full = pathMod.join(base, filePath);
      if (fs.existsSync(full)) {
        try {
          let content = fs.readFileSync(full, 'utf-8');
          if (!content.includes(oldString)) {
            // try fuzzy
            const lines = content.split('\n');
            const searchWords = oldString.split(/\s+/).filter(w => w.length > 3);
            const matchingLines = [];
            for (let i = 0; i < lines.length; i++) {
              if (searchWords.some(w => lines[i].includes(w))) {
                matchingLines.push(`Line ${i+1}: ${lines[i].substring(0, 120)}`);
              }
            }
            if (matchingLines.length > 0) {
              return `❌ patch_file: old_string not found exactly. Similar lines:\n${matchingLines.slice(0, 10).join('\n')}\n\nUse the exact whitespace from read_file.`;
            }
            return `❌ patch_file: old_string not found in ${filePath}`;
          }
          const newContent = content.split(oldString).join(newString);
          fs.writeFileSync(full, newContent, 'utf-8');
          return `✅ Patched locally: ${filePath}`;
        } catch(e) {}
      }
    }
    if (!this.token) return '❌ GITHUB_TOKEN not set and no local files found';
    try {
      const data    = await this.githubGet(filePath);
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      
      if (!content.includes(oldString)) {
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
      
      let updated = content.replace(oldString, newString);
      if (updated === content) return `❌ old_string not found in ${filePath} (after replace attempt).`;

      // Auto-fix: Replace SafeAreaView from 'react-native' with 'react-native-safe-area-context'
      // SafeAreaView from react-native is a no-op on Android — must use react-native-safe-area-context
      if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
        // Remove SafeAreaView from react-native import
        updated = updated.replace(
          /import\s+\{([^}]*)SafeAreaView([^}]*)\}\s+from\s+['"]react-native['"]/g,
          (match, before, after) => {
            const cleaned = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'SafeAreaView');
            return `import { ${cleaned.join(', ')} } from 'react-native'`;
          }
        );
        // Add SafeAreaView from react-native-safe-area-context if it's used in the file but not yet imported from there
        if (updated.includes('<SafeAreaView') && !updated.includes("from 'react-native-safe-area-context'") && !updated.includes('from "react-native-safe-area-context"')) {
          // Add import after the last react-native import line
          const lines = updated.split('\n');
          let lastImportIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) lastImportIdx = i;
          }
          if (lastImportIdx >= 0) {
            lines.splice(lastImportIdx + 1, 0, "import { SafeAreaView } from 'react-native-safe-area-context';");
            updated = lines.join('\n');
          }
        }
      }

      // Auto-fix duplicate imports — consolidate imports from same source
      if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
        const lines = updated.split('\n');
        const importsBySource = {}; // { 'react-native': [imports...] }
        const otherLines = [];
        
        // Parse all imports
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('import ')) {
            otherLines.push(line);
            continue;
          }
          
          // Match: import { A, B } from 'module';
          const match = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
          if (match) {
            const imports = match[1].split(',').map(s => s.trim()).filter(Boolean);
            const source = match[2];
            
            if (!importsBySource[source]) importsBySource[source] = new Set();
            imports.forEach(imp => importsBySource[source].add(imp));
          } else {
            // Keep non-destructured imports (default imports, etc.)
            otherLines.push(line);
          }
        }
        
        // Rebuild consolidated imports
        const consolidatedImports = Object.entries(importsBySource)
          .map(([source, imports]) => `import { ${Array.from(imports).sort().join(', ')} } from '${source}';`)
          .sort();
        
        // Merge back: consolidatedImports at top, then rest of file
        const finalLines = [];
        let importsSectionDone = false;
        
        for (const line of otherLines) {
          const trimmed = line.trim();
          // When we hit first non-import non-empty line, insert consolidated imports first
          if (!importsSectionDone && trimmed !== '' && !trimmed.startsWith('import ')) {
            finalLines.push(...consolidatedImports);
            importsSectionDone = true;
          }
          finalLines.push(line);
        }
        
        // If file ends with imports, add consolidated at end
        if (!importsSectionDone) {
          finalLines.push(...consolidatedImports);
        }
        
        updated = finalLines.join('\n');
      }

      await this.githubPut(filePath, updated, `AI: patch ${filePath}`, data.sha);
      return `✅ Patched and pushed to GitHub: ${filePath}`;
    } catch (err) {
      // If 409 conflict, try to get fresh SHA and retry once
      if (err.message && err.message.includes('409')) {
        try {
          const fresh = await this.githubGet(filePath);
          await this.githubPut(filePath, updated, `AI: patch ${filePath}`, fresh.sha);
          return `✅ Patched and pushed to GitHub: ${filePath}`;
        } catch (e2) {
          return `❌ patch failed: ${e2.message}`;
        }
      }
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

  async runTsc() {
    try {
      const appPath = this.env.PROJECT_PATH || '/opt/render/project/proximity-app';
      const { execSync } = await import('child_process');
      // Pull latest first so we check current code
      try { execSync(`git -C "${appPath}" pull origin main`, { stdio: 'pipe', timeout: 30000 }); } catch (_) {}
      const output = execSync(
        `cd "${appPath}" && npx tsc --noEmit --skipLibCheck 2>&1 | head -50`,
        { encoding: 'utf-8', stdio: 'pipe', timeout: 60000 }
      );
      const errors = (output || '').split('\n').filter(l => l.includes('error TS'));
      if (errors.length === 0) return '✅ No TypeScript errors — code compiles clean.';
      return `❌ ${errors.length} TypeScript error(s):\n${errors.slice(0, 20).join('\n')}`;
    } catch (err) {
      const output = err.stdout || err.message || '';
      const errors = output.split('\n').filter(l => l.includes('error TS'));
      if (errors.length > 0) return `❌ ${errors.length} TypeScript error(s):\n${errors.slice(0, 20).join('\n')}`;
      return `❌ tsc failed: ${output.substring(0, 500)}`;
    }
  }
  getDate() { return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  getMemoryStats() {
    try { return JSON.stringify(this.memory.getStats(), null, 2); }
    catch (_) { return 'Memory stats unavailable'; }
  }

  // ── Tool registry ──────────────────────────────────────────

  defineTools() {
    return {
      search_files: {
        description: 'Search for text/content across the GitHub repository. Use this FIRST when looking for specific text like "hello", UI strings, function names, etc. Returns file paths and matching snippets.',
        execute: async (p) => this.searchFiles(p.query),
      },
      read_file: {
        description: 'Read a file from GitHub repo. Returns content with line numbers. Use start_line to page through large files.',
        execute: async (p) => this.readFile(p.path, p.start_line || 0, p.max_lines || 300),
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
      run_tsc: {
        description: 'Run TypeScript compiler check on the proximity app. Use this to verify your changes compile before declaring done, or to check what errors exist.',
        execute: async () => this.runTsc(),
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
