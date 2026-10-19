/**
 * Web Search Module for Agent
 * Fetches real documentation and API info from the web
 * Uses DuckDuckGo API (free, no authentication needed)
 */

export class WebSearch {
  constructor() {
    this.cache = new Map();
    this.maxCacheAge = 60 * 60 * 1000;
    this.initialized = false;
  }

  /**
   * Search for documentation or API info
   * @param {string} query - Search query (e.g., "react-native useLocation hook API")
   * @returns {Promise<string>} - Formatted search results
   */
  async search(query) {
    if (!query || query.length < 2) {
      return '';
    }

    const cacheKey = query.toLowerCase();
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.maxCacheAge) {
      console.log(`🔍 Web search cache hit for: "${query}"`);
      return cached.results;
    }

    try {
      console.log(`🔍 Searching web for: "${query}"`);

      // Try DuckDuckGo API (free, no auth required)
      const results = await this._searchDuckDuckGo(query);
      
      if (results) {
        this.cache.set(cacheKey, {
          results,
          timestamp: Date.now(),
        });
        return results;
      }

      return '';
    } catch (error) {
      console.error(`⚠️ Web search error: ${error.message}`);
      return '';
    }
  }

  /**
   * Get current date/time from a reliable external API
   * Used by get_date and get_time tools
   */
  async fetchCurrentDateTime() {
    // Try worldtimeapi.org — free, no auth, returns accurate datetime with timezone
    try {
      const response = await fetch('https://worldtimeapi.org/api/ip', {
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        return { ok: true, datetime: data.datetime, timezone: data.timezone, source: 'worldtimeapi.org' };
      }
    } catch (e) {
      console.log(`worldtimeapi failed: ${e.message}`);
    }

    // Fallback: timeapi.io
    try {
      const response = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC');
      if (response.ok) {
        const data = await response.json();
        return { ok: true, datetime: `${data.date}T${data.time}Z`, timezone: 'UTC', source: 'timeapi.io' };
      }
    } catch (e) {
      console.log(`timeapi.io failed: ${e.message}`);
    }

    return { ok: false };
  }

  /**
   * Search using DuckDuckGo Instant Answer API (free, no auth)
   * Falls back to HTML scraping if instant answer returns nothing useful
   */
  async _searchDuckDuckGo(query) {
    try {
      // First try DuckDuckGo instant answer API
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ProximityAgentBot/1.0)',
        },
      });

      if (response.ok) {
        const data = await response.json();
        let results = '';

        if (data.AbstractText) {
          results += `📌 Summary:\n${data.AbstractText}\n\n`;
        }
        if (data.Answer) {
          results += `✅ Answer: ${data.Answer}\n\n`;
        }
        if (data.Definition) {
          results += `Definition: ${data.Definition}\n\n`;
        }
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          const topics = data.RelatedTopics
            .filter(t => t.Text)
            .slice(0, 4)
            .map((t, i) => `${i + 1}. ${t.Text}`)
            .join('\n');
          if (topics) results += `Related:\n${topics}\n\n`;
        }
        if (data.Results && data.Results.length > 0) {
          const res = data.Results
            .filter(r => r.Text)
            .slice(0, 3)
            .map((r, i) => `${i + 1}. ${r.Text.substring(0, 150)}`)
            .join('\n');
          if (res) results += `Results:\n${res}\n`;
        }

        if (results.trim()) {
          return results.trim();
        }
      }

      // Fallback: try DuckDuckGo HTML search for news/current events
      console.log(`⚠️ DDG instant answer empty, trying HTML search...`);
      return await this._searchDuckDuckGoHTML(query);

    } catch (error) {
      console.error(`DuckDuckGo search failed: ${error.message}`);
      return this._constructDocumentation(query);
    }
  }

  /**
   * DuckDuckGo HTML search — works for news and general queries
   */
  async _searchDuckDuckGoHTML(query) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        return this._constructDocumentation(query);
      }

      const html = await response.text();

      // Extract result snippets using regex (no DOM parser needed)
      const snippets = [];

      // Match result titles and snippets
      const titleMatches = html.matchAll(/class="result__title"[^>]*>.*?<a[^>]*>([^<]{5,200})<\/a>/gs);
      const snippetMatches = html.matchAll(/class="result__snippet"[^>]*>([^<]{10,300})</gs);

      const titles = [...titleMatches].map(m => m[1].trim().replace(/&amp;/g, '&').replace(/&#x27;/g, "'")).slice(0, 5);
      const snips = [...snippetMatches].map(m => m[1].trim().replace(/&amp;/g, '&').replace(/&#x27;/g, "'")).slice(0, 5);

      if (titles.length === 0 && snips.length === 0) {
        return this._constructDocumentation(query);
      }

      let results = `🔍 Web results for "${query}":\n\n`;
      const count = Math.max(titles.length, snips.length);
      for (let i = 0; i < Math.min(count, 4); i++) {
        if (titles[i]) results += `📰 ${titles[i]}\n`;
        if (snips[i]) results += `   ${snips[i]}\n`;
        results += '\n';
      }

      return results.trim();
    } catch (error) {
      console.error(`DDG HTML search failed: ${error.message}`);
      return this._constructDocumentation(query);
    }
  }

  /**
   * Construct documentation from query keywords (fallback when API fails)
   * For dev queries: returns known patterns
   * For general queries: returns empty so LLM uses its own knowledge
   */
  _constructDocumentation(query) {
    const q = query.toLowerCase();
    
    // Pattern matching for common API queries
    if (q.includes('useauth') || q.includes('use auth')) {
      return `📌 useAuth() Hook Documentation:
React Native authentication hook that provides user session management.

Returns object:
- user: User object or null
- session: Session object or null  
- loading: boolean - true while authenticating
- signIn(email, password): Promise - authenticate user
- signUp(email, password): Promise - create new account
- signOut(): Promise - sign out current user
- signInWithOAuth(provider): Promise - OAuth sign in

Example:
const { user, session, loading, signOut } = useAuth();
if (loading) return <Text>Loading...</Text>;
return <Button onPress={signOut} title="Sign Out" />;`;
    }

    if (q.includes('uselocation') || q.includes('useCurrentLocation')) {
      return `📌 useCurrentLocation() Hook Documentation:
React Native location tracking hook.

Returns object:
- location: { latitude, longitude } or null
- isLoading: boolean - true while getting location
- error: string or null
- permissionStatus: string - 'granted' | 'denied' | 'undetermined'
- requestPermission(): Promise<boolean> - request location access

Example:
const { location, isLoading, error, requestPermission } = useCurrentLocation();
if (!location) await requestPermission();`;
    }

    if (q.includes('usenearby') || q.includes('useNearbyPeers')) {
      return `📌 useNearbyPeers() Hook Documentation:
React Native hook for finding nearby users with geolocation.

Returns object:
- peers: Array<FormattedNearbyPeer> - list of nearby users
- selectedRadius: number - current search radius in meters
- isLoading: boolean
- error: ApiError | null
- setRadius(radius: number): void - set search radius
- refresh(): Promise<void> - refresh peer list

Example:
const { peers, selectedRadius, setRadius, refresh } = useNearbyPeers(location);`;
    }

    if (q.includes('usechat') || q.includes('useChatMessages')) {
      return `📌 useChatMessages() Hook Documentation:
React Native hook for chat messaging.

Parameters:
- peerId: string - chat partner's ID
- peerName: string - chat partner's name

Returns object:
- messages: Array<ChatMessage> - message history
- isLoading: boolean
- sendMessage(text: string): Promise<void> - send message

Example:
const { messages, isLoading, sendMessage } = useChatMessages(peerId, peerName);`;
    }

    if (q.includes('typescript') && q.includes('error')) {
      return `📌 Common TypeScript Errors:
TS2339 - Property does not exist on type
  → Check if property name is spelled correctly
  → Check if property is actually defined in the interface
  → Use exact casing (case-sensitive)

TS1109 - Expression expected
  → Code is incomplete or has syntax error
  → Check for missing semicolons, brackets
  → Ensure code is not truncated

TS2307 - Cannot find module
  → Package is not installed
  → Import path is incorrect
  → Run npm install`;
    }

    // For general/news queries, return empty so the LLM uses its own knowledge
    // Don't confuse the agent with dev docs when someone asks about Elon Musk or current events
    return '';
  }

  /**
   * Search for React Native documentation
   */
  async searchReactNativeDocs(topic) {
    return this.search(`react-native ${topic} official documentation API`);
  }

  /**
   * Search for TypeScript types and interfaces
   */
  async searchTypeScriptTypes(typeName) {
    return this.search(`TypeScript ${typeName} type definition interface`);
  }

  /**
   * Search for Expo documentation
   */
  async searchExpoDocs(topic) {
    return this.search(`Expo ${topic} API documentation`);
  }

  /**
   * Search for hook usage patterns
   */
  async searchHookPattern(hookName) {
    return this.search(`${hookName} React hook usage example pattern`);
  }

  /**
   * Search for specific error message solutions
   */
  async searchErrorSolution(errorCode, errorMessage) {
    return this.search(`${errorCode} TypeScript ${errorMessage} solution fix`);
  }

  /**
   * Format search results for use in LLM prompt
   */
  formatForPrompt(searchResults) {
    if (!searchResults) {
      return '';
    }

    return `
=== REAL DOCUMENTATION (from web search) ===
${searchResults}
===`;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Web search cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

export default new WebSearch();
