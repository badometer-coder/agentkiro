-- Agent Memory Tables for Supabase

-- Task history - logs all tasks executed by agents
CREATE TABLE IF NOT EXISTS agent_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_name VARCHAR(255),
  task_description TEXT,
  status VARCHAR(50), -- 'completed', 'failed', 'pending', 'revision'
  result TEXT, -- Full result/code generated
  revisions INT DEFAULT 0,
  provider_used VARCHAR(100), -- Which LLM provider
  tokens_used INT DEFAULT 0,
  execution_time INT, -- milliseconds
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Session history - logs each agent swarm session
CREATE TABLE IF NOT EXISTS agent_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_start TIMESTAMP,
  session_end TIMESTAMP,
  tasks_completed INT,
  tasks_failed INT,
  conversation_turns INT,
  success_rate FLOAT,
  metadata JSONB, -- Additional stats
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversation history - logs all conversations
CREATE TABLE IF NOT EXISTS agent_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_message TEXT,
  agent_response TEXT,
  intent VARCHAR(100),
  agent_name VARCHAR(100),
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent decisions - logs important decisions made
CREATE TABLE IF NOT EXISTS agent_decisions (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(100),
  decision VARCHAR(255),
  reasoning TEXT,
  task_context TEXT,
  outcome VARCHAR(50), -- 'success', 'failure', 'pending'
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Learnings - stores patterns and insights
CREATE TABLE IF NOT EXISTS agent_learnings (
  id BIGSERIAL PRIMARY KEY,
  learning_type VARCHAR(100), -- 'pattern', 'best_practice', 'anti_pattern'
  content TEXT,
  frequency INT DEFAULT 1,
  success_rate FLOAT,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_timestamp ON agent_tasks(timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_timestamp ON agent_sessions(session_start);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_timestamp ON agent_conversations(timestamp);
