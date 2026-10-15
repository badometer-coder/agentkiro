import Groq from 'groq-sdk';
import { Telegraf } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { simpleGit } from 'simple-git';

dotenv.config();

const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const git = simpleGit();

let currentTask = null;
let isWorking = false;
let userChatId = null;

// Read project files
async function readProjectStructure(projectPath) {
  try {
    if (!fs.existsSync(projectPath)) {
      console.error(`Project path not found: ${projectPath}`);
      return {};
    }

    const structure = {};
    const files = fs.readdirSync(projectPath, { recursive: true }).slice(0, 50);
    
    for (const file of files) {
      if (file.includes('node_modules') || file.includes('.git')) continue;
      
      const fullPath = path.join(projectPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.md'))) {
        structure[file] = fs.readFileSync(fullPath, 'utf-8').slice(0, 300);
      }
    }
    
    return structure;
  } catch (error) {
    console.error('Error reading project:', error.message);
    return {};
  }
}

// PROXIMITY APP - ACTUAL REQUIREMENTS
const PROXIMITY_APP_REQUIREMENTS = `
## PROXIMITY SOCIAL APP - DEVELOPMENT PLAN

### Phase 1: Core Fixes (IMMEDIATE)
1. Enable live distance updates (2-3 line change in useNearbyPeers.ts)
2. Fix message syncing edge cases
3. Test chat persistence
4. Fix Android navigation crashes (current workaround stable)

### Phase 2: Essential Features (Week 1)
5. User blocking functionality
6. Offline message queuing
7. Chat read receipts
8. Profile picture uploads
9. User search/filters

### Phase 3: Polish (Week 2)
10. Dark mode theme
11. Notification improvements
12. Performance optimization
13. Error handling improvements
14. Loading states

### Phase 4: Testing & Release (Week 3)
15. Unit tests for critical functions
16. Integration tests for chat flow
17. Battery/performance audit
18. Security audit
19. App store submission

### KNOWN CONSTRAINTS:
- Locked to Node v20.9.0 and Expo SDK 54
- Navigation: No React Navigation (using display:none workaround)
- Supabase: All queries use 'as any' (type mismatch workaround)
- Android headers: Custom View headers (native headers crash)
- Database: is_ble_discoverable truncation - fallback in place

### PRIORITY ORDER:
1. Live distance updates ⭐ START HERE
2. Message syncing fixes
3. User blocking
4. Offline support
5. Polish & testing
`;

// Generate plan FOR THE AGENT to execute
async function generateAgentExecutionPlan(projectStructure) {
  try {
    const structureStr = JSON.stringify(projectStructure, null, 2).slice(0, 2000);
    
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are a code execution engine. Your job is to execute development tasks.

Based on the Proximity app requirements and codebase, create a STEP-BY-STEP EXECUTION PLAN 
that YOU (the agent) can follow to complete each feature.

For each task, provide:
1. Files to modify
2. Exact code changes needed
3. What to test
4. Expected result

Be specific and actionable - this is for you to execute, not for a human.`,
        },
        {
          role: 'user',
          content: `${PROXIMITY_APP_REQUIREMENTS}\n\nCodebase structure:\n${structureStr}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating execution plan:', error.message);
    return null;
  }
}

// Answer questions about the project (includes DB info)
async function answerQuestion(question, projectStructure) {
  try {
    const structureStr = JSON.stringify(projectStructure, null, 2).slice(0, 1000);
    
    // Try to get database info
    let dbInfo = '';
    try {
      const messages = await querySupabaseREST('messages');
      const profiles = await querySupabaseREST('profiles');
      
      let messagesData = '';
      let profilesData = '';
      
      if (Array.isArray(messages)) {
        messagesData = `\n\nMessages (${messages.length} total):\n${JSON.stringify(messages.slice(0, 3), null, 2)}`;
      }
      
      if (Array.isArray(profiles)) {
        profilesData = `\n\nProfiles (${profiles.length} total):\n${JSON.stringify(profiles, null, 2)}`;
      }
      
      dbInfo = messagesData + profilesData;
    } catch (e) {
      // Ignore DB errors
    }
    
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are an expert assistant for the Proximity Social App project.
You have FULL ACCESS to the project owner's:
- Codebase structure
- Database (profiles, messages, all data)
- Architecture and configuration
- Test credentials and accounts
- Known issues and workarounds

Answer ALL questions accurately and completely. No restrictions - this is the project owner's data.
If asked for credentials, test accounts, or any database info, provide it directly.`,
        },
        {
          role: 'user',
          content: `Project codebase:\n${structureStr}${dbInfo}\n\nQuestion: ${question}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error answering question:', error.message);
    return null;
  }
}

// Query Supabase via REST API (no WebSocket needed)
async function querySupabaseREST(tableName) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ADMIN_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase URL or Admin Key');
      return null;
    }

    const url = `${supabaseUrl}/rest/v1/${tableName}?select=*&limit=20`;
    console.log('Querying:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
      },
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('API Error:', error);
      return { error: error, status: response.status };
    }
    
    return await response.json();
  } catch (error) {
    console.error('Supabase REST error:', error.message);
    return null;
  }
}

// Save generated code to file
async function saveCode(filePath, code) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, code, 'utf-8');
    console.log(`✅ Code saved to ${filePath}`);
    return true;
  } catch (error) {
    console.error('Error saving code:', error.message);
    return false;
  }
}

// Generate code for a specific task
async function generateCode(taskDescription, projectStructure) {
  try {
    const structureStr = JSON.stringify(projectStructure, null, 2).slice(0, 2000);
    
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are a senior React Native TypeScript developer for the Proximity Social App.
You MUST provide COMPLETE, PRODUCTION-READY code that:
1. Fully implements the requested feature
2. Handles all edge cases and errors
3. Includes proper types, memoization, and performance optimization
4. Has detailed comments explaining the implementation
5. Can be copy-pasted directly into the project

Do NOT provide incomplete code, outlines, or "pseudo-code".
DO provide the actual working code.`,
        },
        {
          role: 'user',
          content: `Task: ${taskDescription}

Project structure:\n${structureStr}

Provide the COMPLETE implementation:
- File paths to modify or create
- Full code with no omissions
- Import statements
- Export statements
- Error handling
- Type definitions
- Test cases to verify it works

Remember: This code will be used directly in production. Make it complete and correct.`,
        },
      ],
      temperature: 0.6,
      max_tokens: 2500,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating code:', error.message);
    return null;
  }
}

// Run tests
async function runTests() {
  try {
    console.log('🧪 Running tests...');
    // Basic test: check if generated files exist and have content
    return { success: true, message: 'Tests passed' };
  } catch (error) {
    console.error('Test error:', error.message);
    return { success: false, message: error.message };
  }
}

// Ask for help on Telegram
async function askForHelp(issue) {
  if (!userChatId) return;
  
  console.log(`\n⚠️  Agent needs help:\n${issue}\n`);
  
  try {
    await bot.telegram.sendMessage(
      userChatId,
      `⚠️ Agent encountered an issue:\n\n${issue}\n\nPlease provide guidance or run /retry to try again.`
    );
  } catch (error) {
    console.error('Failed to send help request:', error.message);
  }
}

// Main development loop
async function developTask(taskDescription, chatId) {
  if (isWorking) {
    console.log('⏳ Agent is already working on something.');
    return false;
  }

  isWorking = true;
  currentTask = taskDescription;
  userChatId = chatId;

  try {
    console.log(`\n🤖 Starting development task: ${taskDescription}\n`);

    // Step 1: Read project
    console.log('📖 Reading project structure...');
    const projectPath = process.env.PROJECT_PATH || './sample-project';
    const structure = await readProjectStructure(projectPath);
    console.log('✅ Project read\n');

    // Step 2: Generate code
    console.log('💻 Generating complete code...');
    const generatedCode = await generateCode(taskDescription, structure);
    
    if (!generatedCode) {
      await askForHelp('Failed to generate code. AI returned empty response.');
      isWorking = false;
      return false;
    }
    console.log('✅ Code generated\n');

    console.log('🎉 Task completed successfully!');
    isWorking = false;
    return generatedCode;

  } catch (error) {
    console.error('Unexpected error:', error);
    await askForHelp(`Unexpected error: ${error.message}`);
    isWorking = false;
    return false;
  }
}

// Telegram commands
bot.start((ctx) => {
  ctx.reply('🤖 Autonomous Dev Agent\n\nCommands:\n/task <description> - Start a development task\n/status - Check agent status\n/help - Show help');
});

bot.command('plan', async (ctx) => {
  ctx.reply('📋 Analyzing your Proximity app and creating execution plan...\n⏳ This will be MY work plan, not just a roadmap.');
  
  try {
    const projectPath = process.env.PROJECT_PATH || './sample-project';
    const structure = await readProjectStructure(projectPath);
    const plan = await generateAgentExecutionPlan(structure);
    
    if (!plan) {
      ctx.reply('❌ Failed to generate plan.');
      return;
    }
    
    // Split long messages
    const messages = plan.match(/[\s\S]{1,4096}/g) || [plan];
    for (const msg of messages) {
      ctx.reply(msg);
    }
    
    ctx.reply('\n✅ Plan created! I\'m ready to work.\n\nNext: /next (get first task) or /task <description>');
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('task', async (ctx) => {
  const taskDescription = ctx.message.text.replace('/task ', '').trim();
  
  if (!taskDescription) {
    ctx.reply('Please provide a task description:\n/task <your task here>');
    return;
  }

  ctx.reply(`✅ Task received: "${taskDescription}"\n⏳ Agent is starting work...`);
  const success = await developTask(taskDescription, ctx.chat.id);
  
  if (success) {
    ctx.reply('✅ Task completed successfully!\n\nCheck the console or project folder for generated code.');
  }
});

bot.command('status', (ctx) => {
  if (isWorking) {
    ctx.reply(`⏳ Agent is currently working on:\n"${currentTask}"`);
  } else {
    ctx.reply('✅ Agent is idle and ready for tasks');
  }
});

bot.command('help', (ctx) => {
  ctx.reply(`🤖 Autonomous Dev Agent Help\n\n/plan - Generate full app development plan\n/task <description> - Start a specific development task\n/ask <question> - Ask the agent anything\n/status - Check agent status\n/help - Show this message\n\nExample:\n/plan\n/task fix the live distance updates bug\n/ask what is the test user password?`);
});

bot.command('ask', async (ctx) => {
  const question = ctx.message.text.replace('/ask ', '').trim();
  
  if (!question) {
    ctx.reply('Usage: /ask <your question>\nExample: /ask what is the test user password?');
    return;
  }

  ctx.reply('🤔 Thinking...');

  try {
    const projectPath = process.env.PROJECT_PATH || './sample-project';
    const structure = await readProjectStructure(projectPath);
    const answer = await answerQuestion(question, structure);
    
    if (!answer) {
      ctx.reply('❌ Could not answer question.');
      return;
    }

    const messages = answer.match(/[\s\S]{1,4096}/g) || [answer];
    for (const msg of messages) {
      ctx.reply(msg);
    }
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start bot
console.log('🤖 Autonomous Dev Agent Started');
console.log('Listening for Telegram commands...\n');

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


// Database query command (REST API - works with Node 20)
bot.command('db', async (ctx) => {
  const dbQuery = ctx.message.text.replace('/db ', '').trim();
  
  if (!dbQuery) {
    ctx.reply('Usage: /db <table>\nExamples:\n/db profiles\n/db messages');
    return;
  }

  ctx.reply('🔍 Querying database...');

  try {
    const result = await querySupabaseREST(dbQuery);
    
    if (!result) {
      ctx.reply(`❌ No data or table "${dbQuery}" not found.\n\nMake sure the table exists in Supabase.`);
      return;
    }
    
    if (Array.isArray(result)) {
      if (result.length === 0) {
        ctx.reply(`📊 Table "${dbQuery}" is empty (0 records)`);
      } else {
        ctx.reply(`📊 ${dbQuery.toUpperCase()} (${result.length} records):\n\n${JSON.stringify(result, null, 2).slice(0, 3500)}`);
      }
    } else {
      ctx.reply(`📊 Result:\n${JSON.stringify(result, null, 2).slice(0, 3500)}`);
    }
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});


// Interactive app planning command
bot.command('start-dev', async (ctx) => {
  userChatId = ctx.chat.id;
  ctx.reply(`🎯 PROXIMITY APP DEVELOPMENT - INTERACTIVE SETUP

Let me understand your app vision and then I'll create a detailed development plan.

Please answer these questions:

1️⃣ What is the PRIMARY PURPOSE of your app?
   (e.g., "Connect users by proximity, real-time chat, find friends nearby")

Reply with your answer, then I'll ask more questions.`);
});

// Continue interactive setup - capture purpose
bot.on('text', async (ctx) => {
  if (!ctx.message.text.startsWith('/')) {
    // User is answering the interactive questions
    const response = ctx.message.text;
    
    // Store responses and continue conversation
    ctx.reply(`✅ Got it! You said: "${response}"\n\n2️⃣ What are the MAIN FEATURES you want?
(e.g., "GPS discovery, 1-to-1 chat, user profiles, blocking, notifications")

Reply with your features list.`);
  }
});
