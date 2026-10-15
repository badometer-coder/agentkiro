import Groq from 'groq-sdk';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import MultiLLMProvider from './multi-llm-provider.js';
import MemoryManager from './memory-manager.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

// Start health server for Render keep-alive
spawn('node', [path.join(__dirname, 'health-server.js')]);

// Notification function for rate limits
let telegramBotContext = null;

function notifyRateLimit(message) {
  console.log(`📢 NOTIFICATION: ${message}`);
  if (telegramBotContext) {
    telegramBotContext.telegram.sendMessage(telegramBotContext.chat.id, message).catch(() => {});
  }
}

// Initialize multi-provider LLM with notification callback
const llmProvider = new MultiLLMProvider(process.env, notifyRateLimit);

// Initialize Memory Manager
const memory = new MemoryManager(process.env);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const APP_REQUIREMENTS = `
PROXIMITY SOCIAL APP - DEVELOPMENT REQUIREMENTS

✅ COMPLETED:
- Database setup with PostGIS
- Authentication (Login/Signup)
- Profile management
- Proximity feed (GPS-based)
- Real-time chat with WebSockets
- Test accounts

❌ TODO (Priority Order):
1. Enable live distance updates (2-3 line change)
2. Fix message syncing edge cases
3. User blocking system
4. Chat read receipts
5. Offline message queuing
6. Performance optimization
7. Battery audit
8. Testing & QA
9. Security audit
10. Release prep
`;

let taskQueue = [];
let currentTask = null;
let taskLog = [];
let conversationHistory = []; // Remember last 10 messages

async function createExecutionPlan(topic = null) {
  try {
    console.log('📋 Project Manager: Creating execution plan...');
    
    const messages = [
      {
        role: 'system',
        content: `Create a detailed, actionable development plan for the Proximity app.

For EACH task, provide:
- Task name
- EXACT file paths to modify
- Specific code implementation details
- What to test

Format each task as: "N. [File: path/to/file.ts] - Task description - Expected changes: ..."

Be SPECIFIC. Every task should be clear enough that a developer can immediately start coding.`,
      },
      {
        role: 'user',
        content: topic
          ? `Create 5 specific tasks focused on: "${topic}"\n\nContext:\n${APP_REQUIREMENTS}`
          : `Requirements:\n${APP_REQUIREMENTS}\n\nCreate 5 specific, actionable development tasks with exact file paths and implementation details.`,
      },
    ];

    const plan = await llmProvider.callLLM(messages, {
      temperature: 0.6,
      max_tokens: 800,
    });

    const tasks = plan.split('\n').filter(line => line.trim().length > 0);
    
    console.log(`✅ Created ${tasks.length} tasks`);
    return tasks;
  } catch (error) {
    console.error('Error creating plan:', error.message);
    return [];
  }
}

async function executeTask(taskDescription) {
  try {
    const stats = llmProvider.getStats();
    console.log(`💻 Dev Agent: Executing task (Provider: ${stats.currentProvider})...`);
    
    const messages = [
      {
        role: 'system',
        content: `YOU ARE A CODE GENERATOR FOR REACT NATIVE + TYPESCRIPT.

STRICT REQUIREMENTS:
1. ALWAYS provide COMPLETE, RUNNABLE CODE. NO outlines. NO "pseudo-code". NO "here's how you would".
2. ALWAYS specify exact file paths: "File: src/screens/Chat.tsx" or "File: src/hooks/useLocation.ts"
3. ALWAYS include ALL imports and exports
4. ALWAYS include full TypeScript types
5. ALWAYS include error handling
6. ALWAYS include comments explaining key logic
7. ALWAYS provide a test case or usage example

IF YOU CANNOT PROVIDE COMPLETE CODE, RESPOND WITH:
"INCOMPLETE: [reason]. I need more context about [specific detail]."

Do NOT provide outlines, suggestions, or incomplete snippets.
Do NOT say "you would" or "you could" or "add this".
Do NOT ask for clarification.

PROVIDE READY-TO-USE CODE OR SAY YOU CAN'T.`,
      },
      {
        role: 'user',
        content: `IMPLEMENT THIS TASK:

${taskDescription}

REQUIREMENTS CONTEXT:
${APP_REQUIREMENTS}

PROVIDE:
- File paths to create or modify
- Complete code (all imports, all exports, all types)
- Error handling
- Test/usage example

START WITH "File:" and show COMPLETE working code.`,
      },
    ];

    let result;
    try {
      result = await Promise.race([
        llmProvider.callLLM(messages, {
          temperature: 0.7,
          max_tokens: 900,
          timeout: 6 * 60 * 1000, // 6 minute timeout
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task execution timeout - took too long')), 7 * 60 * 1000) // 7 minute hard limit
        ),
      ]);
    } catch (error) {
      if (error.message.includes('timeout')) {
        console.log(`⏱️ Task execution timed out. Skipping...`);
        return null;
      }
      throw error;
    }

    if (!result) {
      console.log('❌ No response from LLM');
      return null;
    }

    // === EXTRACT AND SAVE CODE ===
    const fileMatches = result.match(/File:\s*([^\n]+)/g) || [];
    const savedFiles = [];
    
    for (const fileMatch of fileMatches) {
      const filePath = fileMatch.replace('File:', '').trim();
      
      const fileIndex = result.indexOf(fileMatch);
      const nextFileIndex = result.indexOf('File:', fileIndex + 1);
      const endIndex = nextFileIndex === -1 ? result.length : nextFileIndex;
      
      let codeBlock = result.substring(fileIndex + fileMatch.length, endIndex);
      const codeMatch = codeBlock.match(/```(?:typescript|tsx|ts|javascript|jsx)?[\n\r]([\s\S]*?)```/);
      if (codeMatch) codeBlock = codeMatch[1];
      const code = codeBlock.trim();
      
      if (code.length > 0) {
        // Use Render's writable project directory
        const appPath = process.env.PROJECT_PATH || '/opt/render/project/proximity-app';
        const fullPath = path.join(appPath, filePath);
        
        console.log(`💾 Saving to: ${fullPath}`);
        try {
          const dir = path.dirname(fullPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, code, 'utf-8');
          savedFiles.push({ fullPath, filePath });
          console.log(`✅ Saved: ${fullPath}`);
        } catch (writeError) {
          // Fallback: save to local swarm/output directory
          const fallbackPath = path.join(__dirname, 'output', filePath);
          try {
            fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
            fs.writeFileSync(fallbackPath, code, 'utf-8');
            savedFiles.push({ fullPath: fallbackPath, filePath });
            console.log(`✅ Saved (fallback): ${fallbackPath}`);
          } catch (e) {
            console.error(`❌ Could not save ${filePath}: ${writeError.message}`);
          }
        }
      }
    }

    // === AUTO-COMMIT TO GITHUB ===
    if (savedFiles.length > 0) {
      const appPath = process.env.PROJECT_PATH || '/opt/render/project/proximity-app';
      const githubToken = process.env.GITHUB_TOKEN;
      try {
        const { execSync } = await import('child_process');
        // Configure git
        execSync(`git -C "${appPath}" config user.email "agent@proximity.app"`, { stdio: 'pipe' });
        execSync(`git -C "${appPath}" config user.name "AI Agent"`, { stdio: 'pipe' });
        // Set remote with token if available
        if (githubToken) {
          execSync(`git -C "${appPath}" remote set-url origin https://${githubToken}@github.com/badometer-coder/proximity-app.git`, { stdio: 'pipe' });
        }
        execSync(`git -C "${appPath}" add -A`, { stdio: 'pipe' });
        const commitMsg = `AI: ${taskDescription.substring(0, 60).replace(/"/g, "'")}`;
        execSync(`git -C "${appPath}" commit -m "${commitMsg}"`, { stdio: 'pipe' });
        execSync(`git -C "${appPath}" push origin main`, { stdio: 'pipe' });
        console.log(`✅ Committed and pushed ${savedFiles.length} file(s) to GitHub`);
      } catch (gitError) {
        console.log(`⚠️ Git commit failed: ${gitError.message.split('\n')[0]}`);
      }
    }

    taskLog.push({
      task: taskDescription,
      result: result,
      savedFiles: savedFiles,
      timestamp: new Date().toISOString(),
      provider: llmProvider.getCurrentProvider().name,
    });
    
    if (savedFiles.length > 0) {
      console.log(`✅ Task complete - saved ${savedFiles.length} file(s)`);
    } else {
      console.log(`✅ Task execution complete (no files saved)\n`);
    }
    return result;
  } catch (error) {
    console.error('Error executing task:', error.message);
    return null;
  }
}

async function validateTaskCompletion(taskDescription, executionResult) {
  try {
    console.log('🔍 Project Manager: Validating solution completeness...');
    
    const messages = [
      {
        role: 'system',
        content: `YOU ARE A STRICT PROJECT MANAGER VALIDATING CODE WORK.

A solution is COMPLETE if it provides:
1. ACTUAL CODE (not outlines, suggestions, or "how-to" instructions)
2. File paths clearly identified (with "File:" prefix OR clear filename markers)
3. Complete imports (import statements present)
4. Complete exports (export functions/classes/types present)
5. Full TypeScript types (minimal use of 'any')
6. Error handling (try/catch or validation)
7. Ready to copy-paste and use

REJECT ONLY if:
- Response is just an outline or suggestion ("add this", "modify X to")
- No actual code provided
- All file paths are missing
- Critical imports/exports missing
- No error handling at all

DO NOT REJECT for minor formatting issues like missing "File:" prefix on every declaration.
DO NOT REJECT for incomplete test files if the main implementation is complete.

RESPOND IN THIS FORMAT:
- Decision: YES or NO
- Brief reason if NO
- One key improvement needed if NO`,
      },
      {
        role: 'user',
        content: `TASK:\n${taskDescription}\n\nSOLUTION:\n${executionResult}`,
      },
    ];

    const validation = await llmProvider.callLLM(messages, {
      temperature: 0.7,
      max_tokens: 400,
    });

    console.log('✅ Validation complete\n');
    return validation;
  } catch (error) {
    console.error('Error validating:', error.message);
    return null;
  }
}

bot.start((ctx) => {
  console.log(`\n✅ Bot started by user ${ctx.from.id}`);
  ctx.reply(`🤖 AGENT COORDINATOR\n\nCommands:\n/status - Show progress\n/tasks - Show completed tasks\n/memory - Show stats\n\nOr just chat naturally!`);
});

bot.command('init', async (ctx) => {
  ctx.reply('🚀 Starting development...\n⏳ PM generating plan...');
  
  try {
    const tasks = await createExecutionPlan();
    
    if (tasks.length === 0) {
      ctx.reply('❌ Failed to create plan');
      return;
    }
    
    taskQueue = tasks;
    ctx.reply(`✅ Plan created: ${tasks.length} tasks\n\n📋 Next:\n${tasks[0]}\n\nUse /execute`);
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('execute', async (ctx) => {
  if (taskQueue.length === 0) {
    ctx.reply('❌ No tasks. Run /init first.');
    return;
  }
  
  const task = taskQueue.shift();
  currentTask = task;
  
  console.log(`\n🚀 EXECUTE: Processing task: ${task.substring(0, 100)}...`);
  ctx.reply(`💻 Dev Agent working...\n${task.substring(0, 500)}`);
  
  const result = await executeTask(task);
  
  if (result) {
    console.log(`✅ Dev Agent completed task`);
    const messages = result.match(/[\s\S]{1,4096}/g) || [result];
    for (const msg of messages) {
      ctx.reply(msg);
    }
    
    ctx.reply('\n🔍 PM validating completeness...');
    const validation = await validateTaskCompletion(task, result);
    
    console.log(`🔍 Validation result:\n${validation?.substring(0, 200) || 'null'}`);
    
    if (validation) {
      const valMessages = validation.match(/[\s\S]{1,4096}/g) || [validation];
      for (const msg of valMessages) {
        ctx.reply(msg);
      }
      
      // Check if PM approved (look for "YES" or "approved" in the validation text)
      const validationUpper = validation.toUpperCase();
      const approved = validationUpper.includes('DECISION: YES') || validationUpper.includes('YES') && !validationUpper.includes('NO');
      
      console.log(`✅ Approved: ${approved}`);
      
      if (!approved) {
        // Rejected - re-queue for revision
        taskQueue.unshift(`[REVISION] ${task}`);
        console.log(`⚠️ Task rejected. Re-queued for revision.`);
        ctx.reply('\n⚠️ REJECTED - Solution incomplete. Re-queued for revision.\nUse /execute to have Dev Agent revise.');
      } else {
        // Approved
        console.log(`✅ Task approved!`);
        if (taskQueue.length > 0) {
          ctx.reply(`\n✅ APPROVED! 📋 ${taskQueue.length} tasks remaining. Use /execute for next.`);
        } else {
          ctx.reply('\n✅ APPROVED! All tasks completed! 🎉');
        }
      }
    }
  } else {
    console.log(`❌ Dev Agent failed to execute task`);
    ctx.reply('❌ Dev Agent failed to execute task');
  }
});

bot.command('status', (ctx) => {
  const total = taskQueue.length + taskLog.length;
  const completed = taskLog.length;
  
  ctx.reply(`📊 PROGRESS\n✅ Done: ${completed}\n⏳ Remaining: ${taskQueue.length}\n📈 Total: ${total}`);
});

bot.command('help', (ctx) => {
  ctx.reply(`🤖 COORDINATOR HELP\n\n/init - Generate plan\n/execute - Run next task (manual)\n/auto - Run ALL remaining tasks automatically\n/status - Check progress\n/keys - Show API keys in use\n/usage - Show token usage\n/help - This message`);
});

bot.command('keys', (ctx) => {
  const stats = llmProvider.getStats();
  ctx.reply(`🔑 LLM PROVIDERS\n\n✅ Total: ${stats.totalProviders}\n📌 Current: ${stats.currentProvider}\n\n${stats.providers.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nProviders will auto-rotate on rate limits.`);
});

bot.command('usage', async (ctx) => {
  ctx.reply('📊 Checking Groq API usage...');
  
  try {
    // Try to get usage from Groq API
    const response = await fetch('https://api.groq.com/usage', {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      ctx.reply(`📊 GROQ API USAGE\n\n${JSON.stringify(data, null, 2)}`);
    } else {
      ctx.reply('⚠️ Could not fetch usage. Visit https://console.groq.com to check manually.');
    }
  } catch (error) {
    console.error('Error fetching usage:', error.message);
    
    // Fallback: show local task log stats
    const totalTokensEstimate = taskLog.length * 2000; // Rough estimate
    ctx.reply(`📊 LOCAL STATS (Rough Estimate)\n\n✅ Tasks completed: ${taskLog.length}\n📈 Estimated tokens used: ~${totalTokensEstimate}\n\nFor accurate Groq usage:\n👉 Visit https://console.groq.com/account/billing`);
  }
});

// Auto-execute all tasks
async function autoExecuteAll(ctx) {
  if (taskQueue.length === 0) {
    ctx.reply('❌ No tasks. Run /init first.');
    return;
  }
  
  // Set Telegram context for notifications
  telegramBotContext = ctx;
  
  const totalTasks = taskQueue.length;
  ctx.reply(`🚀 AUTO MODE: Executing ${totalTasks} tasks automatically...\n⏳ This will take a few minutes. Monitoring via Telegram.\n\n📢 I'll notify you when a provider hits rate limit.`);
  
  let completed = 0;
  let revised = 0;
  let maxRevisions = 3; // Prevent infinite loops
  let taskRevisionCount = {}; // Track revisions per task
  
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    currentTask = task;
    
    // Remove existing revision prefix to get clean task key
    const cleanTask = task.replace(/^\[REVISION-\d+\]\s*/g, '');
    const taskKey = cleanTask.substring(0, 80); // Use first 80 chars as task ID
    const revisionCount = taskRevisionCount[taskKey] || 0;
    
    console.log(`\n[${'='.repeat(50)}]`);
    console.log(`AUTO EXECUTE: ${completed + 1}/${totalTasks} (Revisions: ${revised})`);
    console.log(`Task: ${cleanTask.substring(0, 100)}...`);
    console.log(`Revision attempt: ${revisionCount}/${maxRevisions}`);
    
    const result = await executeTask(cleanTask);
    
    if (!result) {
      console.log(`❌ Task failed - skipping`);
      completed++;
      continue;
    }
    
    const validation = await validateTaskCompletion(cleanTask, result);
    const approved = validation && (validation.toUpperCase().includes('DECISION: YES') || (validation.toUpperCase().includes('YES') && !validation.toUpperCase().includes('NO')));
    
    if (!approved && revisionCount < maxRevisions) {
      console.log(`⚠️ Task rejected (revision ${revisionCount + 1}/${maxRevisions})`);
      // Re-queue with clean revision prefix (not stacked)
      taskQueue.unshift(`[REVISION-${revisionCount + 1}] ${cleanTask}`);
      taskRevisionCount[taskKey] = revisionCount + 1;
      revised++;
      
      if (revised % 5 === 0) {
        ctx.reply(`⚠️ Auto-executing... (${completed} done, ${revised} revisions, ${taskQueue.length} remaining)`).catch(() => {});
      }
    } else if (!approved && revisionCount >= maxRevisions) {
      console.log(`❌ Task exceeded max revisions (${maxRevisions}). Skipping.`);
      completed++;
      delete taskRevisionCount[taskKey];
      ctx.reply(`⚠️ Task skipped (exceeded ${maxRevisions} revision attempts)`).catch(() => {});
    } else {
      console.log(`✅ Task approved!`);
      completed++;
      delete taskRevisionCount[taskKey]; // Clear revision count for this task
      
      // Record successful task to memory
      memory.recordTaskCompletion(cleanTask, true, result, llmProvider.getCurrentProvider().name, revisionCount);
      
      if (completed % 10 === 0) {
        ctx.reply(`✅ Auto-executing... (${completed}/${totalTasks} done, ${revised} revisions, ${taskQueue.length} remaining)`).catch(() => {});
      }
    }
  }
  
  ctx.reply(`\n🎉 AUTO EXECUTION COMPLETE!\n✅ Completed: ${completed}\n⚠️ Revisions: ${revised}\n📊 Total Processed: ${totalTasks}`);
  console.log(`\n🎉 AUTO EXECUTION FINISHED: ${completed} completed, ${revised} revisions out of ${totalTasks}`);
  
  // Clear context
  telegramBotContext = null;
}

bot.command('auto', async (ctx) => {
  await autoExecuteAll(ctx);
});

// Natural Language Intent Classifier
async function classifyUserIntent(message) {
  try {
    const response = await llmProvider.callLLM([
      {
        role: 'system',
        content: `What does the user want? Answer with ONLY ONE of these words:
PLAN
RUN_ALL
EXECUTE_N
EXECUTE_ONE
STATUS
MEMORY
HELP

Do not explain. Just write the word.`,
      },
      {
        role: 'user',
        content: message,
      },
    ], {
      temperature: 0.1,
      max_tokens: 10,
      timeout: 15 * 1000,
    });

    const intent = response.trim().toUpperCase();
    console.log(`🧠 Intent raw response: "${response}"`);
    console.log(`🧠 Intent parsed: "${intent}"`);
    console.log(`🧠 Response length: ${response.length}, Type: ${typeof response}`);
    if (intent.includes('PLAN')) return 'PLAN';
    if (intent.includes('RUN_ALL') || intent.includes('RUN ALL')) return 'RUN_ALL';
    if (intent.includes('EXECUTE_N')) return 'EXECUTE_N';
    if (intent.includes('EXECUTE_ONE')) return 'EXECUTE_ONE';
    if (intent.includes('STATUS')) return 'STATUS';
    if (intent.includes('MEMORY')) return 'MEMORY';
    if (intent.includes('HELP')) return 'HELP';
    
    console.log(`⚠️ Unknown intent: "${intent}"`);
    return null;
  } catch (error) {
    console.error('❌ Intent classification error:', error.message);
    return null;
  }
}

// Handle all natural language messages
bot.on('text', async (ctx) => {
  try {
    const raw = ctx.message.text.trim();
    const msg = raw.toLowerCase();
    if (raw.startsWith('/')) return;
    console.log(`\n💬 User: "${raw}"`);

    // --- GREETINGS ---
    if (/^(hey|hi|hello|sup|yo|hiya|howdy)[\s!.?]*$/.test(msg)) {
      return ctx.reply(`Hey! 👋 I'm your dev agent building the Proximity app.\n\n📋 Queued: ${taskQueue.length} tasks\n✅ Done: ${taskLog.length} tasks\n\nJust tell me what to do naturally!`);
    }

    // --- STATUS ---
    if (msg.includes('status') || msg.includes('progress') || (msg.includes('how many') && msg.includes('task')) || msg.includes('done so far')) {
      const stats = memory.getStats();
      return ctx.reply(`📊 Progress\n✅ Done: ${taskLog.length}\n⏳ Queued: ${taskQueue.length}\n💡 Success: ${stats.successRate?.current?.toFixed(1) || 'N/A'}%${taskLog.length > 0 ? `\n\nLast: ${(taskLog[taskLog.length-1]?.task||'').substring(0,80)}` : ''}`);
    }

    // --- LIST TASKS ---
    if (msg.match(/^(list|show)\s+(tasks|plans?)/) || msg.match(/what (tasks|plans?) do you have/)) {
      if (taskQueue.length === 0) return ctx.reply('No tasks queued. Tell me what to work on!');
      const keyword = msg.includes('ui') || msg.includes('screen') || msg.includes('design') ? 'ui' :
                      msg.includes('login') ? 'login' :
                      msg.includes('auth') ? 'auth' :
                      msg.includes('chat') ? 'chat' :
                      msg.includes('profile') ? 'profile' :
                      msg.includes('location') || msg.includes('gps') ? 'location' : null;
      const filtered = keyword ? taskQueue.filter(t => t.toLowerCase().includes(keyword)) : taskQueue.slice(0, 15);
      const label = keyword ? `${keyword}-related` : 'planned';
      return ctx.reply(`📋 ${filtered.length} ${label} tasks:\n\n${filtered.slice(0, 10).map((t, i) => `${i+1}. ${t.substring(0, 100)}`).join('\n')}${filtered.length > 10 ? `\n...and ${filtered.length - 10} more` : ''}`);
    }

    // --- RUN ALL ---
    if ((msg.includes('run') || msg.includes('execute') || msg.includes('start')) &&
        (msg.includes('all') || msg.includes('everything'))) {
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued. Tell me what to work on first!');
      return autoExecuteAll(ctx);
    }

    // --- RUN N TASKS ---
    const runMatch = msg.match(/(?:run|do|execute|start)\s+(\d+)/);
    if (runMatch) {
      const count = parseInt(runMatch[1]);
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued. Tell me what to work on first!');
      return runTasks(ctx, count);
    }

    // --- "go ahead" / "continue" / "yes do it" ---
    if (msg.match(/^(go ahead|continue|yes|do it|proceed|ok do it|start|begin|sure)[\s!.?]*$/)) {
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued. Tell me what you want me to build first!');
      await ctx.reply(`🚀 Starting on the next task...`);
      return runTasks(ctx, 1);
    }

    // --- LLM handles everything else (including "make a change on login", "plan about X", etc.) ---
    const stats = memory.getStats();
    const taskPreview = taskQueue.slice(0, 5).map((t, i) => `${i+1}. ${t.substring(0, 80)}`).join('\n');

    // Add to conversation history for context
    conversationHistory.push({ role: 'user', content: raw });
    if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);

    const llmReply = await llmProvider.callLLM([
      {
        role: 'system',
        content: `You are an autonomous AI dev agent building the Proximity Social App (React Native + TypeScript).

CURRENT STATE: ${taskQueue.length} tasks queued, ${taskLog.length} done.
${taskQueue.length > 0 ? `Queued tasks:\n${taskPreview}` : 'No tasks queued.'}

ACTION TAGS (add at end of reply):
- User wants you to build/change/fix/improve/make something → [DOTASK: specific description with file path]
- User says "go ahead", "do it", "yes", "please", "continue", "sure", "proceed" → check history and repeat last requested task as [DOTASK: ...]
- User wants a list of tasks created → [DOPLAN: topic]
- User wants to run queued tasks → [RUN: N]
- Pure chat → no tags

NEVER use [DOPLAN:] unless user explicitly says "make a plan" or "create tasks".
For "make a change", "improve", "fix", "update" → always use [DOTASK:] directly.
Keep reply under 50 words.`,
      },
      ...conversationHistory,
    ], { temperature: 0.3, max_tokens: 200 });

    // Add to history
    conversationHistory.push({ role: 'assistant', content: llmReply });

    // Parse action tags
    const cleanReply = llmReply.replace(/\[(DOTASK|DOPLAN|RUN):[^\]]*\]/g, '').trim();
    const taskMatch = llmReply.match(/\[DOTASK:\s*([^\]]+)\]/);
    let planMatch = llmReply.match(/\[DOPLAN:\s*([^\]]+)\]/);
    const runMatch2 = llmReply.match(/\[RUN:\s*(\d+)\]/);

    // Safety: if user didn't say "plan" or "create tasks", don't create a plan - execute directly
    if (planMatch && !msg.includes('make a plan') && !msg.includes('create tasks') && !msg.includes('create a plan')) {
      console.log(`⚠️ LLM tried DOPLAN but user didn't ask for a plan - converting to DOTASK`);
      planMatch = null;
    }

    if (cleanReply) await ctx.reply(cleanReply);

    if (taskMatch) {
      const specificTask = taskMatch[1].trim();
      await ctx.reply(`⚙️ Working on it...`);
      const result = await executeTask(specificTask);
      if (result) {
        memory.recordTaskCompletion(specificTask, true, result, llmProvider.getCurrentProvider().name, 0);
        const preview = result.substring(0, 600);
        await ctx.reply(`✅ Done!\n\n${preview}${result.length > 600 ? '\n...(full code saved)' : ''}`);
      } else {
        await ctx.reply(`❌ Couldn't complete that task. Try being more specific.`);
      }
    } else if (planMatch) {
      const topic = planMatch[1].trim();
      await ctx.reply(`📋 Creating plan for: ${topic}`);
      const tasks = await createExecutionPlan(topic);
      taskQueue = tasks;
      await ctx.reply(`✅ ${tasks.length} tasks created!\n\nFirst 5:\n${tasks.slice(0,5).map((t,i)=>`${i+1}. ${t.substring(0,80)}`).join('\n')}\n\nSay "go ahead" to start!`);
    } else if (runMatch2) {
      const count = parseInt(runMatch2[1]);
      if (taskQueue.length === 0) return ctx.reply('❌ No tasks queued.');
      return runTasks(ctx, count);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    ctx.reply(`Error: ${error.message}`).catch(() => {});
  }
});

// Helper: run N tasks
async function runTasks(ctx, count) {
  const toRun = Math.min(count, taskQueue.length);
  await ctx.reply(`🚀 Running ${toRun} task(s)...`);
  let completed = 0;
  for (let i = 0; i < toRun; i++) {
    const task = taskQueue.shift();
    try {
      await ctx.reply(`⚙️ [${i+1}/${toRun}] ${task.substring(0, 80)}...`);
      const result = await executeTask(task);
      if (result) {
        const validation = await validateTaskCompletion(task, result);
        const approved = validation && validation.toUpperCase().includes('DECISION: YES');
        if (approved) {
          completed++;
          taskLog.push({ task, result });
          memory.recordTaskCompletion(task, true, result, llmProvider.getCurrentProvider().name, 0);
          await ctx.reply(`✅ Task ${i+1} done!`);
        } else {
          taskQueue.unshift(`[REVISION] ${task}`);
          await ctx.reply(`⚠️ Task ${i+1} needs revision.`);
        }
      }
    } catch (err) {
      await ctx.reply(`❌ Task ${i+1} failed: ${err.message}`);
    }
  }
  return ctx.reply(`📊 Done! ${completed}/${toRun} succeeded. ${taskQueue.length} remaining.`);
}

bot.command('status', (ctx) => {
  const total = taskQueue.length + taskLog.length;
  const completed = taskLog.length;
  
  ctx.reply(`📊 PROGRESS\n✅ Done: ${completed}\n⏳ Remaining: ${taskQueue.length}\n📈 Total: ${total}`);
});

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  if (ctx && ctx.chat) {
    ctx.reply(`⚠️ Error: ${err.message}`).catch(() => {});
  }
});

// Show completed tasks
bot.command('tasks', (ctx) => {
  console.log(`\n📋 /tasks command received from user ${ctx.from.id}`);
  
  if (taskLog.length === 0) {
    console.log(`❌ No completed tasks`);
    ctx.reply('❌ No completed tasks yet.');
    return;
  }
  
  const completedList = taskLog
    .slice(-10) // Show last 10
    .map((t, i) => `${taskLog.length - 10 + i + 1}. ${(t.task || t.name)?.substring(0, 70) || 'Unknown'}`)
    .join('\n');
  
  console.log(`✅ Sending ${Math.min(10, taskLog.length)} completed tasks`);
  ctx.reply(`✅ Last ${Math.min(10, taskLog.length)} completed tasks:\n\n${completedList}`);
});

// Memory command - show learning stats
bot.command('memory', (ctx) => {
  console.log(`\n📚 /memory command received`);
  const stats = memory.getStats();
  ctx.reply(`📚 MEMORY STATS\n\n📊 Session started: ${stats.sessionStart.substring(0, 10)}\n✅ Completed: ${stats.tasksCompleted}\n❌ Failed: ${stats.tasksFailed}\n💬 Conversations: ${stats.conversationTurns}\n📈 Success rate: ${stats.successRate?.current?.toFixed(1) || 'N/A'}%\n\n🏆 Best practices: ${stats.lastBestPractices?.length || 0}`);
});

// Debug: Log ALL updates
bot.use((ctx, next) => {
  console.log(`📨 Update: ${ctx.update.update_id}, Type: ${Object.keys(ctx.update).filter(k => k !== 'update_id')[0]}`);
  return next();
});

console.log('🤖 Agent Coordinator Started');
console.log('📱 Listening for Telegram messages...\n');

// Start Telegram bot with polling
async function startBot() {
  try {
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message']
    });
    console.log('✅ Telegram bot launched (polling mode)');
  } catch (error) {
    console.error('❌ Failed to launch Telegram bot:', error.message);
    console.error('   Retrying in 15 seconds...');
    setTimeout(startBot, 15000);
  }
}

startBot();

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Shutting down...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('Shutting down...');
  bot.stop('SIGTERM');
});

// Global error handler to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
