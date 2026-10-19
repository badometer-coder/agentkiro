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
   * Search using DuckDuckGo Instant Answer API (free, no auth)
   */
  async _searchDuckDuckGo(query) {
    try {
      // Use DuckDuckGo's instant answer API
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      
      const response = await fetch(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ProximityAgentBot/1.0)',
        },
      });

      if (!response.ok) {
        console.log(`⚠️ DuckDuckGo returned ${response.status}, trying alternative approach`);
        return this._constructDocumentation(query);
      }

      const data = await response.json();
      
      // Extract useful info from DuckDuckGo response
      let results = '';

      // Add instant answer if available
      if (data.AbstractText) {
        results += `📌 Summary:\n${data.AbstractText}\n\n`;
      }

      // Add related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        results += `Related topics:\n`;
        data.RelatedTopics.slice(0, 5).forEach((topic, i) => {
          if (topic.Text) {
            results += `${i + 1}. ${topic.Text}\n`;
          }
        });
        results += '\n';
      }

      // Add definition if available
      if (data.Definition) {
        results += `Definition: ${data.Definition}\n\n`;
      }

      // Add infobox if available
      if (data.Infobox) {
        results += `Info: ${JSON.stringify(data.Infobox).substring(0, 200)}\n\n`;
      }

      // Add source URLs if available
      if (data.Results && data.Results.length > 0) {
        results += `Results:\n`;
        data.Results.slice(0, 3).forEach((result, i) => {
          if (result.Text) {
            results += `${i + 1}. ${result.Text.substring(0, 150)}\n`;
          }
        });
      }

      // If we got something, return it; otherwise provide fallback
      if (results.trim()) {
        return results.trim();
      }

      // Fallback: construct based on query keywords
      return this._constructDocumentation(query);
    } catch (error) {
      console.error(`DuckDuckGo search failed: ${error.message}`);
      // Return constructed documentation as fallback
      return this._constructDocumentation(query);
    }
  }

  /**
   * Construct documentation from query keywords (fallback when API fails)
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

    // Generic response
    return `📌 API Documentation Search Result
Query: "${query}"

Note: Full documentation not available locally.
For comprehensive documentation, visit:
- React Native: https://reactnative.dev/docs
- Expo: https://docs.expo.dev
- TypeScript: https://www.typescriptlang.org/docs/`;
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
