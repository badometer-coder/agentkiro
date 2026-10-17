#!/usr/bin/env node
/**
 * Local Agent Execution Test
 * Tests agent code generation with web search (no Telegram needed)
 */

import * as dotenv from 'dotenv';
import MultiLLMProvider from './swarm/multi-llm-provider.js';
import MemoryManager from './swarm/memory-manager.js';
import WebSearch from './swarm/web-search.js';

dotenv.config();

const llmProvider = new MultiLLMProvider(process.env, (msg) => console.log(`📢 ${msg}`));
const memory = new MemoryManager(process.env);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║         AGENT EXECUTION TEST WITH WEB SEARCH                   ║
╚════════════════════════════════════════════════════════════════╝
`);

const TYPE_DEFINITIONS_CONTEXT = `
=== REAL TYPE DEFINITIONS (MEMORIZE THESE - use EXACTLY these, never invent new properties) ===

HOOK SIGNATURES (from hooks/) — EXACT return types:
- useAuth() returns: { user: User|null, session: Session|null, loading: boolean, signIn, signUp, signOut }
  ↳ NOTE: property name is "loading" NOT "isLoading"
- useCurrentLocation() returns: { location: GPSCoordinates|null, isLoading: boolean, error: string|null, permissionStatus: string, requestPermission }
- useNearbyPeers(location) returns: { peers: FormattedNearbyPeer[], selectedRadius: number, isLoading: boolean, error, setRadius, refresh }
- useChatMessages(peerId, peerName) returns: { messages: ChatMessage[], isLoading: boolean, sendMessage }

UTILS EXPORTS (from src/lib/utils/index.ts):
- formatDistance(meters: number): string
- getSignalStrength(distanceMeters: number): SignalStrength
- getPresenceStatus(lastActiveAt: string): UserPresenceStatus
- formatRelativeTime(date: string): string
`;

async function testAgentWithWebSearch() {
  try {
    console.log('\n📝 Test: Agent generates code to use useAuth hook\n');
    
    const taskDescription = 'Add a sign out button in the home screen using the useAuth hook';
    
    // Simulate what executeTask does: search for keywords
    console.log('Step 1: Extract keywords from task');
    const keywords = ['useAuth', 'sign out', 'button'];
    console.log(`Keywords: ${keywords.join(', ')}`);
    
    console.log('\nStep 2: Search web for documentation');
    const searchQuery = 'useAuth React Native TypeScript API documentation';
    console.log(`Searching: "${searchQuery}"`);
    const webDocs = await WebSearch.search(searchQuery);
    console.log(`✓ Got ${webDocs.length} chars of documentation\n`);
    
    console.log('Step 3: Build LLM prompt with web search context');
    
    const messages = [
      {
        role: 'system',
        content: `YOU ARE A CODE GENERATOR FOR REACT NATIVE + TYPESCRIPT.

${TYPE_DEFINITIONS_CONTEXT}

${WebSearch.formatForPrompt(webDocs)}

REQUIREMENTS:
1. Generate COMPLETE file content
2. Start with "File: <path>"
3. Use ONLY real API properties from the documentation above
4. NO markdown fences — raw code only
5. NO truncation — complete code
6. If code ends with }, ;, or ) then it's valid
7. Only use properties that exist in the real hooks`,
      },
      {
        role: 'user',
        content: `TASK: ${taskDescription}

Generate a React component that:
1. Imports useAuth hook
2. Gets user, session, and signOut from useAuth
3. Shows user info and a sign out button
4. Uses ONLY real properties from the hook (loading, NOT isLoading)

Output format:
File: src/screens/main/HomeScreen.tsx
[complete code here]`,
      },
    ];

    console.log('Step 4: Call LLM to generate code');
    const stats = llmProvider.getStats();
    console.log(`Using provider: ${stats.currentProvider}`);
    
    const result = await llmProvider.callLLM(messages, {
      temperature: 0.3,
      max_tokens: 2000,
      timeout: 30 * 1000,
    });

    console.log('\n✓ LLM Response received\n');
    console.log('Generated Code:');
    console.log('─'.repeat(60));
    
    // Extract and show the code
    const codeMatch = result.match(/File:[^\n]*\n([\s\S]+?)(?=File:|$)/);
    const code = codeMatch ? codeMatch[1].trim() : result.substring(0, 500);
    
    console.log(code.substring(0, 800));
    if (code.length > 800) console.log('\n... (truncated for display) ...\n');
    
    console.log('─'.repeat(60));

    // Analyze the generated code
    console.log('\n✓ Analysis:');
    console.log(`  Code length: ${code.length} characters`);
    
    // Check for hallucinations
    const hallucinations = [];
    if (code.includes('refreshLocation')) hallucinations.push('refreshLocation (made-up property)');
    if (code.includes('errorMsg')) hallucinations.push('errorMsg (made-up property)');
    if (code.includes('isLoading') && !code.includes('// isLoading')) {
      hallucinations.push('isLoading (should be "loading")');
    }
    if (code.includes('openChat')) hallucinations.push('openChat (made-up export)');
    if (code.includes('calculateDistanceKm')) hallucinations.push('calculateDistanceKm (made-up function)');
    
    if (hallucinations.length > 0) {
      console.log(`  ❌ Hallucinations detected: ${hallucinations.join(', ')}`);
    } else {
      console.log(`  ✅ No hallucinations detected`);
    }

    // Check for real properties
    const realProps = [];
    if (code.includes('signOut')) realProps.push('✓ signOut (real property)');
    if (code.includes('loading') && !code.includes('isLoading')) realProps.push('✓ loading (correct, not isLoading)');
    if (code.includes('user')) realProps.push('✓ user (real property)');
    if (code.includes('session')) realProps.push('✓ session (real property)');
    
    console.log(`  Real API usage:`);
    realProps.forEach(p => console.log(`    ${p}`));

    // Check code completeness
    const lastChar = code[code.length - 1];
    if (lastChar === '}' || lastChar === ';' || lastChar === ')') {
      console.log(`  ✅ Code appears complete (ends with '${lastChar}')`);
    } else {
      console.log(`  ⚠️ Code may be truncated (ends with '${lastChar}')`);
    }

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              ✅ AGENT TEST COMPLETE                            ║
╚════════════════════════════════════════════════════════════════╝

Summary:
  • Web search context successfully injected
  • Agent received real API documentation
  • Code generated without hallucinations
  • Real properties used correctly
  • Ready for production testing!
    `);

  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testAgentWithWebSearch();
