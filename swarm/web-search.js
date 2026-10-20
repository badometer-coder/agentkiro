/**
 * Web Search Module — modelled on Hermes's multi-backend approach
 * Backend priority (matches Hermes): Tavily → Brave → DuckDuckGo
 * Auto-detects which API key is available in env
 */

export class WebSearch {
  constructor(env = process.env) {
    this.env = env;
    this.cache = new Map();
    this.maxCacheAge = 5 * 60 * 1000; // 5 min (shorter than before — news goes stale)
  }

  /**
   * Select which backend to use based on available API keys
   * Priority matches Hermes: keyed backends first, then keyless (Exa MCP), then DDG
   */
  _getBackend() {
    if (this.env.TAVILY_API_KEY) return 'tavily';
    if (this.env.BRAVE_SEARCH_API_KEY) return 'brave';
    if (this.env.PERPLEXITY_API_KEY) return 'perplexity';
    return 'exa-keyless'; // free, no key — same endpoint Hermes uses
  }

  /**
   * Main search entry point
   */
  async search(query) {
    if (!query || query.trim().length < 2) return '';

    const cacheKey = query.toLowerCase().trim();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.maxCacheAge) {
      console.log(`🔍 Cache hit: "${query}"`);
      return cached.results;
    }

    const backend = this._getBackend();
    console.log(`🔍 Searching [${backend}]: "${query}"`);

    let results = '';
    try {
      if (backend === 'tavily') results = await this._searchTavily(query);
      else if (backend === 'brave') results = await this._searchBrave(query);
      else if (backend === 'exa-keyless') results = await this._searchExaKeyless(query);
      else results = await this._searchDuckDuckGo(query);
    } catch (err) {
      console.error(`Search error [${backend}]: ${err.message}`);
      // Fallback to Exa keyless, then DDG
      if (backend !== 'exa-keyless') {
        try { results = await this._searchExaKeyless(query); } catch (_) {}
      }
      if (!results) {
        try { results = await this._searchDuckDuckGo(query); } catch (_) {}
      }
    }

    if (results && results.trim()) {
      this.cache.set(cacheKey, { results, timestamp: Date.now() });
    }
    return results || '';
  }

  /**
   * Exa keyless MCP search — FREE, no API key needed
   * Same endpoint Hermes uses: https://mcp.exa.ai/mcp
   */
  async _searchExaKeyless(query, limit = 5) {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: { query, numResults: Math.min(limit, 5) }
      }
    };

    const response = await fetch('https://mcp.exa.ai/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'hermes-agent',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Exa keyless ${response.status}`);

    const text = await response.text();
    
    // Check for rate limit
    if (text.includes('rateLimited') || text.includes('rate limit')) {
      console.log('⚠️ Exa rate-limited, trying Parallel...');
      return await this._searchParallelKeyless(query, limit);
    }

    return this._parseExaResponse(text, query);
  }

  /**
   * Parallel keyless MCP search — FREE fallback when Exa rate-limits
   * Same endpoint Hermes uses: https://search.parallel.ai/mcp
   */
  async _searchParallelKeyless(query, limit = 5) {
    const sessionId = Math.random().toString(36).substring(2);
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search',
        arguments: { objective: query, search_queries: [query], session_id: sessionId }
      }
    };

    const response = await fetch('https://search.parallel.ai/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'hermes-agent',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Parallel keyless ${response.status}`);

    const text = await response.text();
    return this._parseParallelResponse(text, query);
  }

  /**
   * Parse Parallel MCP response (JSON with results array)
   */
  _parseParallelResponse(text, query) {
    let jsonStr = text;
    if (text.startsWith('event:')) {
      const dataLine = text.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) jsonStr = dataLine.substring(6);
    }

    try {
      const data = JSON.parse(jsonStr);
      const contentText = data?.result?.content?.[0]?.text || '';
      const parsed = JSON.parse(contentText);
      const results = (parsed.results || []).slice(0, 5).map((r, i) => ({
        title: r.title || 'Result',
        url: r.url || '',
        description: (r.excerpts || []).join(' ').substring(0, 300),
      }));

      if (results.length === 0) return '';
      return this._formatResults(results);
    } catch (e) {
      console.error('Parallel parse error:', e.message);
      return '';
    }
  }

  /**
   * Parse Exa MCP response (SSE format: "event: message\ndata: {...}")
   * Content is in result.content[0].text as Title:/URL:/Highlights: blocks
   */
  _parseExaResponse(text, query) {
    // Extract JSON from SSE data line
    let jsonStr = text;
    if (text.startsWith('event:')) {
      const dataLine = text.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) jsonStr = dataLine.substring(6);
    }

    try {
      const data = JSON.parse(jsonStr);
      const contentText = data?.result?.content?.[0]?.text || '';
      if (!contentText) return '';

      // Parse Title:/URL:/Highlights: blocks separated by ---
      const results = [];
      const blocks = contentText.split('\n---\n');

      for (const block of blocks) {
        let title = '', url = '', highlights = [];
        let inHighlights = false;

        for (const line of block.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Title:')) { title = trimmed.substring(6).trim(); inHighlights = false; }
          else if (trimmed.startsWith('URL:')) { url = trimmed.substring(4).trim(); inHighlights = false; }
          else if (trimmed.startsWith('Highlights:')) { inHighlights = true; }
          else if (trimmed.startsWith('Published:') || trimmed.startsWith('Author:')) { inHighlights = false; }
          else if (inHighlights && trimmed) { highlights.push(trimmed); }
        }

        if (url || title) {
          results.push({
            title: title || 'Result',
            url: url || '',
            description: highlights.join(' ').substring(0, 300),
          });
        }
      }

      if (results.length === 0) return '';
      return this._formatResults(results);
    } catch (e) {
      console.error('Exa parse error:', e.message);
      return '';
    }
  }

  /**
   * Tavily Search API — best quality, free tier available
   * https://tavily.com
   */
  async _searchTavily(query) {
    const apiKey = this.env.TAVILY_API_KEY;
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        include_raw_content: false,
        include_images: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Tavily ${response.status}`);
    const data = await response.json();

    return this._formatResults(data.results?.map(r => ({
      title: r.title,
      url: r.url,
      description: r.content?.substring(0, 250),
    })) || []);
  }

  /**
   * Brave Search API — free tier: 2000 queries/month, no credit card
   * https://api.search.brave.com/app/keys
   */
  async _searchBrave(query) {
    const apiKey = this.env.BRAVE_SEARCH_API_KEY;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&text_decorations=false`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Brave ${response.status}`);
    const data = await response.json();

    return this._formatResults(data.web?.results?.map(r => ({
      title: r.title,
      url: r.url,
      description: r.description?.substring(0, 250),
    })) || []);
  }

  /**
   * DuckDuckGo — free but rate-limited/bot-blocked
   * Uses instant answer API only (HTML scraping is blocked by CAPTCHA)
   */
  async _searchDuckDuckGo(query) {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`DDG ${response.status}`);
    const data = await response.json();

    let results = '';
    if (data.Answer) results += `✅ ${data.Answer}\n\n`;
    if (data.AbstractText) results += `📌 ${data.AbstractText}\n\n`;
    if (data.Definition) results += `📖 ${data.Definition}\n\n`;
    if (data.RelatedTopics?.length) {
      const topics = data.RelatedTopics.filter(t => t.Text).slice(0, 4).map(t => `• ${t.Text}`).join('\n');
      if (topics) results += `Related:\n${topics}\n`;
    }

    return results.trim();
  }

  /**
   * Format results array into a readable string (Hermes-style)
   */
  _formatResults(results) {
    if (!results || results.length === 0) return '';
    return results
      .filter(r => r.title || r.description)
      .map((r, i) => `${i + 1}. **${r.title || 'Result'}**\n   ${r.description || ''}\n   ${r.url || ''}`)
      .join('\n\n');
  }

  /**
   * Get current datetime from external API (accurate regardless of server clock)
   */
  async fetchCurrentDateTime() {
    try {
      const r = await fetch('https://worldtimeapi.org/api/ip', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const d = await r.json();
        return { ok: true, datetime: d.datetime, timezone: d.timezone, source: 'worldtimeapi.org' };
      }
    } catch (_) {}

    try {
      const r = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC', {
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const d = await r.json();
        return { ok: true, datetime: `${d.date}T${d.time}Z`, timezone: 'UTC', source: 'timeapi.io' };
      }
    } catch (_) {}

    return { ok: false };
  }

  clearCache() {
    this.cache.clear();
  }
}

export default new WebSearch(process.env);
