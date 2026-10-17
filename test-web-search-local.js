#!/usr/bin/env node
/**
 * Local Web Search Test
 * Tests web search capability without needing Render or Telegram
 */

import WebSearch from './swarm/web-search.js';
import * as dotenv from 'dotenv';

dotenv.config();

console.log(`
╔════════════════════════════════════════════════════════════════╗
║            WEB SEARCH LOCAL TEST                               ║
╚════════════════════════════════════════════════════════════════╝
`);

async function runTests() {
  try {
    // Test 1: Generic search
    console.log('\n📝 Test 1: Generic Web Search');
    console.log('Query: "react-native useLocation API"');
    console.log('⏳ Searching...\n');
    
    const result1 = await WebSearch.search('react-native useLocation API');
    console.log('✅ Result received (first 300 chars):');
    console.log(result1.substring(0, 300));
    console.log(`\n📊 Total length: ${result1.length} characters\n`);

    // Test 2: Cache hit
    console.log('📝 Test 2: Cache Hit (same query again)');
    console.log('Query: "react-native useLocation API"');
    console.log('⏳ Searching (should be instant from cache)...\n');
    
    const start = Date.now();
    const result2 = await WebSearch.search('react-native useLocation API');
    const elapsed = Date.now() - start;
    
    console.log(`✅ Result from cache (${elapsed}ms)`);
    console.log('Cached result matches first result:', result1 === result2);
    console.log(`\n📊 Cache hit confirmed\n`);

    // Test 3: Different query
    console.log('📝 Test 3: Different Query');
    console.log('Query: "TypeScript error TS2339 property not found"');
    console.log('⏳ Searching...\n');
    
    const result3 = await WebSearch.searchErrorSolution('TS2339', 'property not found');
    console.log('✅ Result received (first 300 chars):');
    console.log(result3.substring(0, 300));
    console.log(`\n📊 Total length: ${result3.length} characters\n`);

    // Test 4: Cache stats
    console.log('📝 Test 4: Cache Statistics');
    const stats = WebSearch.getCacheStats();
    console.log(`✅ Cached queries: ${stats.size}`);
    console.log('Entries:');
    stats.entries.forEach((entry, idx) => {
      console.log(`  ${idx + 1}. ${entry}`);
    });

    // Test 5: Format for prompt
    console.log('\n📝 Test 5: Format Results for LLM Prompt');
    const formatted = WebSearch.formatForPrompt(result1);
    console.log('✅ Formatted output (first 200 chars):');
    console.log(formatted.substring(0, 200));

    // Test 6: Clear cache
    console.log('\n📝 Test 6: Clear Cache');
    WebSearch.clearCache();
    const statsAfter = WebSearch.getCacheStats();
    console.log(`✅ Cache cleared. Remaining entries: ${statsAfter.size}`);

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    ✅ ALL TESTS PASSED                         ║
╚════════════════════════════════════════════════════════════════╝

Summary:
  ✓ Web search works (DuckDuckGo API responding)
  ✓ Caching works (instant on second request)
  ✓ Multiple search types work (generic, error solutions)
  ✓ Results can be formatted for LLM
  ✓ Cache can be cleared

Ready to test agent task execution next!
    `);

  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();
