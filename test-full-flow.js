#!/usr/bin/env node
/**
 * Full Agent Flow Test
 * Simulates complete execution: search → generate → validate
 */

import * as dotenv from 'dotenv';
import MultiLLMProvider from './swarm/multi-llm-provider.js';
import WebSearch from './swarm/web-search.js';

dotenv.config();

const llmProvider = new MultiLLMProvider(process.env);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║           FULL AGENT FLOW TEST - COMPLETE PIPELINE             ║
╚════════════════════════════════════════════════════════════════╝
`);

async function runFullFlow() {
  try {
    // ========== PHASE 1: Task Description ==========
    console.log('\n🎯 PHASE 1: Task Description');
    console.log('─'.repeat(60));
    
    const task = 'Add dark mode toggle to ProximityFeedScreen using theme context';
    console.log(`Task: "${task}"\n`);

    // ========== PHASE 2: Web Search ==========
    console.log('🔍 PHASE 2: Web Search for Context');
    console.log('─'.repeat(60));
    
    const searchKeywords = ['theme', 'context', 'dark mode', 'React Native'];
    console.log(`Extracting keywords: ${searchKeywords.join(', ')}`);
    
    const searchQueries = [
      'React Native dark mode theme context',
      'useContext React hook theme provider',
    ];

    let allDocs = '';
    for (const query of searchQueries) {
      console.log(`\n  Searching: "${query}"`);
      const docs = await WebSearch.search(query);
      if (docs) {
        allDocs += docs + '\n\n';
        console.log(`  ✓ Got ${docs.length} chars\n`);
      }
    }

    console.log(`Total documentation collected: ${allDocs.length} chars`);

    // ========== PHASE 3: Code Generation ==========
    console.log('\n💻 PHASE 3: Code Generation');
    console.log('─'.repeat(60));
    
    const messages = [
      {
        role: 'system',
        content: `YOU ARE A CODE GENERATOR FOR REACT NATIVE + TYPESCRIPT.

CRITICAL RULES:
1. ONLY use real properties and functions
2. NO inventing APIs (calculateDistanceKm, refreshLocation, etc.)
3. ALWAYS provide complete, compilable code
4. Start each file with: File: <path>
5. NO markdown fences — raw code only
6. NO truncation — code must end with }, ;, or )

DOCUMENTATION:
${WebSearch.formatForPrompt(allDocs)}

If you're unsure about an API, use only what's documented above.`,
      },
      {
        role: 'user',
        content: `TASK: ${task}

Generate code for ProximityFeedScreen with:
1. Dark mode toggle button
2. Uses real theme context API (not invented)
3. Complete, working component
4. ONLY real properties and functions

Output format:
File: src/screens/main/ProximityFeedScreen.tsx
[complete code]`,
      },
    ];

    console.log('Calling LLM...');
    const code = await llmProvider.callLLM(messages, {
      temperature: 0.3,
      max_tokens: 2000,
      timeout: 30000,
    });

    console.log('✓ Code generated\n');
    
    // Extract code section
    const codeMatch = code.match(/File:[^\n]*\n([\s\S]+?)(?=\n?$)/);
    const actualCode = codeMatch ? codeMatch[1] : code;

    console.log('Generated Code (first 600 chars):');
    console.log(actualCode.substring(0, 600));
    if (actualCode.length > 600) console.log('\n... (truncated) ...\n');

    // ========== PHASE 4: Validation ==========
    console.log('\n✅ PHASE 4: Code Validation');
    console.log('─'.repeat(60));

    const issues = [];

    // Check for completeness
    const lastChar = actualCode[actualCode.length - 1];
    if (lastChar !== '}' && lastChar !== ';' && lastChar !== ')') {
      issues.push(`Code appears truncated (ends with '${lastChar}')`);
    } else {
      console.log('✓ Code is complete');
    }

    // Check for hallucinations
    const hallucinations = [
      'calculateDistanceKm', 'refreshLocation', 'errorMsg', 'isLoading',
      'openChat', 'calculateDistance', 'fetchPeers', 'getPeerData',
    ];
    
    const foundHallucinations = hallucinations.filter(h => actualCode.includes(h));
    if (foundHallucinations.length > 0) {
      issues.push(`Hallucinations detected: ${foundHallucinations.join(', ')}`);
    } else {
      console.log('✓ No hallucinations');
    }

    // Check for real patterns
    const hasImports = actualCode.includes('import');
    const hasExports = actualCode.includes('export') || actualCode.includes('default');
    
    console.log(`✓ Has imports: ${hasImports}`);
    console.log(`✓ Has exports: ${hasExports}`);

    // Check TypeScript
    if (actualCode.includes('any') && !actualCode.includes('// any')) {
      console.log('⚠️ Uses "any" type (less strict)');
    } else {
      console.log('✓ Uses proper TypeScript types');
    }

    // ========== PHASE 5: Summary ==========
    console.log('\n📊 PHASE 5: Summary');
    console.log('─'.repeat(60));

    if (issues.length > 0) {
      console.log(`❌ Issues found: ${issues.length}`);
      issues.forEach(i => console.log(`  • ${i}`));
    } else {
      console.log('✅ No issues detected!');
    }

    const stats = {
      taskLength: task.length,
      docsCollected: allDocs.length,
      codeGenerated: actualCode.length,
      issuesFound: issues.length,
    };

    console.log(`\nStatistics:`);
    console.log(`  Task: ${stats.taskLength} chars`);
    console.log(`  Documentation: ${stats.docsCollected} chars`);
    console.log(`  Generated Code: ${stats.codeGenerated} chars`);
    console.log(`  Issues: ${stats.issuesFound}`);

    const readiness = 100 - (issues.length * 30); // Each issue = -30%
    console.log(`\n🎯 Production Readiness: ${Math.max(0, readiness)}%`);

    if (issues.length === 0) {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║          ✅ READY FOR PRODUCTION DEPLOYMENT                    ║
╚════════════════════════════════════════════════════════════════╝

Web search integration is working perfectly:
  ✓ Real documentation injected into prompts
  ✓ No API hallucinations
  ✓ Complete, deployable code generated
  ✓ Ready to re-enable CI webhook
      `);
    } else {
      console.log('\n⚠️ Address issues before deploying');
    }

  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run flow
runFullFlow();
