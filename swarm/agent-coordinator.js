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

async function createExecutionPlan() {
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
        content: `Requirements:\n${APP_REQUIREMENTS}

Create 5 specific, actionable development tasks with exact file paths and implementation details.`,
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
    
    for (const fileMatch of fileMatches) {
      const filePath = fileMatch.replace('File:', '').trim();
      
      // Extract code block after "File: path"
      const fileIndex = result.indexOf(fileMatch);
      const nextFileIndex = result.indexOf('File:', fileIndex + 1);
      const endIndex = nextFileIndex === -1 ? result.length : nextFileIndex;
      
      let codeBlock = result.substring(fileIndex + fileMatch.length, endIndex);
      
      // Extract from code blocks if wrapped in ```
      const codeMatch = codeBlock.match(/```(?:typescript|tsx|ts|javascript|jsx)?[\n\r]([\s\S]*?)```/);
      if (codeMatch) {
        codeBlock = codeMatch[1];
      }
      
      const code = codeBlock.trim();
      
      if (code.length > 0) {
        // Resolve to actual app path
        const appPath = process.env.PROJECT_PATH || '/Users/owner/proximity-app-final';
        const fullPath = path.join(appPath, filePath);
        
        console.log(`💾 Saving to: ${fullPath}`);
        
        try {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, code, 'utf-8');
          console.log(`✅ Code saved to ${fullPath}`);
        } catch (writeError) {
          console.error(`❌ Failed to save ${fullPath}:`, writeError.message);
        }
      }
    }

    taskLog.push({
      task: taskDescription,
      result: result,
      timestamp: new Date().toISOString(),
      provider: llmProvider.getCurrentProvider().name,
    });
    
    console.log('✅ Task execution complete\n');
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

// Handle all natural language (no commands needed)
bot.on('text', async (ctx) => {
  try {
    const message = ctx.message.text.trim();
    
    if (message.startsWith('/')) return;
    
    console.log(`\n💬 User: "${message}"`);
    
    // Build context for the agent
    const stats = memory.getStats();
    const queueInfo = taskQueue.length > 0 
      ? `Task queue: ${taskQueue.length} tasks pending. Next task: "${taskQueue[0]?.substring(0, 100)}"` 
      : 'Task queue is empty.';
    const completedInfo = `Completed tasks this session: ${taskLog.length}`;
    
    // Let the LLM respond conversationally AND decide what to do
    const agentResponse = await llmProvider.callLLM([
      {
        role: 'system',
        content: `You are an autonomous AI development agent building the Proximity Social App (React Native + TypeScript).

CURRENT STATE:
- ${queueInfo}
- ${completedInfo}
- Memory: ${stats.tasksCompleted} tasks completed total, ${stats.tasksFailed} failed

YOU CAN:
1. Chat naturally with the user
2. Trigger actions by including these EXACT tags in your response:
   [ACTION:PLAN] - create a new development plan
   [ACTION:RUN:N] - run N tasks (replace N with number, e.g. [ACTION:RUN:5])
   [ACTION:RUN_ALL] - run all tasks
   [ACTION:STATUS] - show status

RULES:
- Only add an action tag if the user EXPLICITLY asks you to do something (run tasks, make a plan, etc.)
- If user just says "hey", "hi", "hello" or is just chatting, just chat back - NO action tags
- Be helpful, friendly and concise
- Keep responses under 100 words`,
      },
      {
        role: 'user',
        content: message,
      },
    ], {
      temperature: 0.7,
      max_tokens: 200,
    });

    // Extract action tag if present
    const actionMatch = agentResponse.match(/\[ACTION:([\w:]+)\]/);
    
    // Send the conversational response (without the action tag)
    const cleanResponse = agentResponse.replace(/\[ACTION:[\w:]+\]/g, '').trim();
    if (cleanResponse) {
      await ctx.reply(cleanResponse);
    }

    // Execute the action
    if (actionMatch) {
      const action = actionMatch[1];
      console.log(`🎯 Action: ${action}`);

      if (action === 'PLAN') {
        await ctx.reply('📋 Creating development plan...');
        try {
          const tasks = await createExecutionPlan();
          taskQueue = tasks;
          await ctx.reply(`✅ Created ${tasks.length} tasks! Say "run 5 tasks" to start.`);
        } catch (error) {
          await ctx.reply(`❌ Error creating plan: ${error.message}`);
        }
      }

      else if (action === 'RUN_ALL') {
        if (taskQueue.length === 0) {
          await ctx.reply('❌ No tasks queued. Say "make a plan" first.');
          return;
        }
        await autoExecuteAll(ctx);
      }

      else if (action.startsWith('RUN:')) {
        const count = parseInt(action.split(':')[1]) || 1;
        if (taskQueue.length === 0) {
          await ctx.reply('❌ No tasks queued. Say "make a plan" first.');
          return;
        }
        const toRun = Math.min(count, taskQueue.length);
        await ctx.reply(`🚀 Running ${toRun} task(s)...`);
        let completed = 0;
        for (let i = 0; i < toRun; i++) {
          const task = taskQueue.shift();
          try {
            await ctx.reply(`⚙️ Task ${i+1}/${toRun}: ${task.substring(0, 80)}...`);
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
          } catch (error) {
            await ctx.reply(`❌ Task ${i+1} failed: ${error.message}`);
          }
        }
        await ctx.reply(`\n📊 Done! ${completed}/${toRun} succeeded.\n⏳ ${taskQueue.length} tasks remaining.`);
      }

      else if (action === 'STATUS') {
        const total = taskQueue.length + taskLog.length;
        await ctx.reply(`📊 Status\n✅ Done: ${taskLog.length}\n⏳ Remaining: ${taskQueue.length}\n📈 Total: ${total}\n💡 Success rate: ${stats.successRate?.current?.toFixed(1) || 'N/A'}%`);
      }
    }

  } catch (error) {
    console.error('❌ Error processing message:', error);
    ctx.reply(`Sorry, I hit an error: ${error.message}`).catch(() => {});
  }
});

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
