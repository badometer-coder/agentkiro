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

let userChatId = null;
let projectPlan = null;
let currentPhase = null;
let completedTasks = [];

// Project plan template for Proximity Social App
const PROXIMITY_APP_PLAN = `
# PROXIMITY SOCIAL APP - DEVELOPMENT ROADMAP

## Phase 1: Foundation (Current)
- ✅ Database setup with PostGIS
- ✅ Authentication (Login/Signup)
- ✅ Profile management
- ✅ Proximity feed (GPS-based discovery)
- ✅ Real-time chat with WebSockets
- 🔄 Live distance updates (IN PROGRESS)

## Phase 2: Core Features
- [ ] User blocking system
- [ ] Chat read receipts
- [ ] Offline message queuing
- [ ] User search filters (age, interests)
- [ ] Location privacy controls

## Phase 3: Social Features
- [ ] User profiles with photos
- [ ] Interest/skill matching
- [ ] User reviews/ratings
- [ ] Friend list management
- [ ] Activity feed

## Phase 4: Advanced
- [ ] Voice/video calls
- [ ] Group chats
- [ ] Stories feature
- [ ] Push notifications
- [ ] Analytics dashboard

## Known Issues & Workarounds
1. Navigation: Using display:none instead of React Navigation (Android crash workaround)
2. Supabase types: All queries use 'as any' due to type mismatches
3. Android headers: Custom View headers instead of native (crash fix)
4. Database: is_ble_discoverable truncation bug - fallback in place

## Critical Next Steps
1. Enable live distance updates (2-3 line change)
2. Fix message syncing edge cases
3. Add user blocking functionality
4. Implement offline support
`;

// Read project structure
async function readProjectStructure(projectPath) {
  try {
    if (!fs.existsSync(projectPath)) {
      return {};
    }

    const structure = {};
    const files = fs.readdirSync(projectPath, { recursive: true }).slice(0, 100);
    
    for (const file of files) {
      if (file.includes('node_modules') || file.includes('.git') || file.includes('.expo')) continue;
      
      const fullPath = path.join(projectPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile() && (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.json'))) {
        structure[file] = fs.readFileSync(fullPath, 'utf-8').slice(0, 200);
      }
    }
    
    return structure;
  } catch (error) {
    console.error('Error reading project:', error.message);
    return {};
  }
}

// Generate detailed development plan
async function generateDetailedPlan(projectStructure) {
  try {
    const structureStr = JSON.stringify(projectStructure, null, 2).slice(0, 1500);
    
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are an expert project manager for a React Native Proximity Social App.
          
CURRENT STATE:
- Tech: React Native + Expo SDK 54, TypeScript, Supabase (PostgreSQL + PostGIS)
- Features: GPS-based discovery, real-time chat, user profiles
- Known Issues: Navigation workaround (display:none), Supabase type issues, Android header crashes

Your role:
1. Understand the codebase
2. Create a prioritized development roadmap
3. Identify blockers and dependencies
4. Recommend next 3-5 critical tasks
5. Estimate effort for each task

Return ONLY structured, actionable plan.`,
        },
        {
          role: 'user',
          content: `Analyze this Proximity app codebase and create a detailed development plan:\n\n${structureStr}\n\nKnown plan:\n${PROXIMITY_APP_PLAN}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating plan:', error.message);
    return null;
  }
}

// Get next recommended task
async function getNextTask(completedList, plan) {
  try {
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are a project manager for a React Native Proximity Social App.
          
Given the development plan and completed tasks, recommend the SINGLE most important next task.
Return format:
TASK: <task name>
EFFORT: quick/medium/complex
REASON: <why this is next>
STEPS: <3-5 specific steps>`,
        },
        {
          role: 'user',
          content: `Completed tasks: ${completedList.join(', ') || 'None yet'}\n\nPlan:\n${plan}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error getting next task:', error.message);
    return null;
  }
}

// Send status update to user
async function sendStatusUpdate(message) {
  if (!userChatId) return;
  
  try {
    await bot.telegram.sendMessage(userChatId, message);
  } catch (error) {
    console.error('Failed to send message:', error.message);
  }
}

// Telegram commands
bot.start((ctx) => {
  ctx.reply('🎯 Proximity App Project Manager\n\nCommands:\n/plan - View full development plan\n/next - Get next recommended task\n/status - Current project status\n/task - Assign a development task\n/complete - Mark task as complete\n/help - Show help');
});

bot.command('plan', async (ctx) => {
  userChatId = ctx.chat.id;
  ctx.reply('📋 Analyzing Proximity app and generating plan...');
  
  try {
    const projectPath = process.env.PROJECT_PATH || '/Users/owner/proximity-app-final';
    const structure = await readProjectStructure(projectPath);
    const plan = await generateDetailedPlan(structure);
    
    if (!plan) {
      ctx.reply('❌ Failed to generate plan.');
      return;
    }
    
    projectPlan = plan;
    const messages = plan.match(/[\s\S]{1,4096}/g) || [plan];
    for (const msg of messages) {
      ctx.reply(msg);
    }
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('next', async (ctx) => {
  userChatId = ctx.chat.id;
  
  if (!projectPlan) {
    ctx.reply('Please run /plan first to generate the development plan.');
    return;
  }
  
  ctx.reply('🤔 Analyzing and recommending next task...');
  
  try {
    const nextTask = await getNextTask(completedTasks, projectPlan);
    
    if (!nextTask) {
      ctx.reply('❌ Could not determine next task.');
      return;
    }
    
    ctx.reply(`📌 NEXT RECOMMENDED TASK:\n\n${nextTask}\n\nUse /task to assign this work to the dev agent.`);
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('status', (ctx) => {
  userChatId = ctx.chat.id;
  
  const status = `
📊 PROJECT STATUS

Phase: ${currentPhase || 'Phase 1: Foundation'}

Completed Tasks:
${completedTasks.length > 0 ? completedTasks.map((t, i) => `${i + 1}. ✅ ${t}`).join('\n') : '- None yet'}

Tech Stack:
- React Native + Expo SDK 54
- TypeScript
- Supabase (PostgreSQL + PostGIS)
- Real-time WebSockets

Last Action: ${new Date().toLocaleString()}
  `.trim();
  
  ctx.reply(status);
});

bot.command('task', async (ctx) => {
  userChatId = ctx.chat.id;
  const taskDescription = ctx.message.text.replace('/task ', '').trim();
  
  if (!taskDescription) {
    ctx.reply('Usage: /task <description>\nExample: /task implement live distance updates');
    return;
  }
  
  ctx.reply(`✅ Task received: "${taskDescription}"\n\nThe dev agent will handle this. Use /status to check progress.`);
});

bot.command('complete', (ctx) => {
  userChatId = ctx.chat.id;
  const taskName = ctx.message.text.replace('/complete ', '').trim();
  
  if (!taskName) {
    ctx.reply('Usage: /complete <task name>');
    return;
  }
  
  completedTasks.push(taskName);
  ctx.reply(`✅ Task marked complete: "${taskName}"\n\nCompleted: ${completedTasks.length} tasks`);
});

bot.command('help', (ctx) => {
  const helpText = `
🎯 PROXIMITY APP PROJECT MANAGER

Commands:
/plan - Generate full development roadmap
/next - Get next recommended task
/status - View current project status
/task <desc> - Assign development task
/complete <name> - Mark task as complete
/help - Show this message

Example workflow:
1. /plan → See full roadmap
2. /next → Get recommendation
3. /task implement xyz → Start work
4. /complete implemented xyz → Mark done
5. /next → Get next task
  `.trim();
  
  ctx.reply(helpText);
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start
console.log('🎯 Proximity App Project Manager Started');
console.log('Listening for commands...\n');

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


// Add /ask command to project manager
bot.command('ask', async (ctx) => {
  userChatId = ctx.chat.id;
  const question = ctx.message.text.replace('/ask ', '').trim();
  
  if (!question) {
    ctx.reply('Usage: /ask <your question>\nExample: /ask what is the test login password?');
    return;
  }

  ctx.reply('🤔 Analyzing codebase...');
  
  try {
    const projectPath = process.env.PROJECT_PATH || '/Users/owner/proximity-app-final';
    const structure = await readProjectStructure(projectPath);
    
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are a project manager expert on a React Native Proximity Social App.
You know everything about the codebase including:
- User credentials and test accounts  
- Database configuration
- Features and architecture
- Known issues and workarounds

Answer questions accurately and helpfully.`,
        },
        {
          role: 'user',
          content: `Question: ${question}\n\nProject info: ${JSON.stringify(structure).slice(0, 1500)}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const answer = response.choices[0]?.message?.content;
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
