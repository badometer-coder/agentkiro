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
   */
  _getBackend() {
    if (this.env.TAVILY_API_KEY) return 'tavily';
    if (this.env.BRAVE_SEARCH_API_KEY) return 'brave';
    return 'duckduckgo'; // free fallback, may be rate-limited
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
      else results = await this._searchDuckDuckGo(query);
    } catch (err) {
      console.error(`Search error [${backend}]: ${err.message}`);
      // Try DuckDuckGo as emergency fallback
      if (backend !== 'duckduckgo') {
        try { results = await this._searchDuckDuckGo(query); } catch (_) {}
      }
    }

    if (results && results.trim()) {
      this.cache.set(cacheKey, { results, timestamp: Date.now() });
    }
    return results || '';
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
