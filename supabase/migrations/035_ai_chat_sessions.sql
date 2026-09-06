-- Migration 035: AI Chat Sessions & Messages
-- Persistent conversational memory for AI Agent

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(32) NOT NULL,
    title VARCHAR(200),                    -- first user message, truncated
    project_id VARCHAR(32),
    total_tokens INT NOT NULL DEFAULT 0,
    max_tokens INT NOT NULL DEFAULT 100000,
    message_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON ai_chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON ai_chat_sessions(tenant_id);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT,
    tool_calls JSONB,                      -- [{name, args, result, status}]
    tokens_used INT NOT NULL DEFAULT 0,
    iteration INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON ai_chat_messages(session_id, created_at ASC);

-- Token quota per user (default 100K for now)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_chat_token_quota INT DEFAULT 100000;
