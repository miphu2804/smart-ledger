-- Visibility and control for the agent's long-term memory (ADR-0002), after Sakana
-- Chat's "My Fish": the owner can see what the agent used and switch memory off.
--   * last_used_at / use_count record each recall. Decay then runs from the last use
--     (Generative Agents' recency), so a fact the owner keeps relying on stays fresh.
--   * superseded_by is Mem0-style update: a corrected fact points the old one at
--     itself and search skips the old one. The old row is kept, not deleted, so
--     AC-022 still holds: deleting the newer fact's chat sets the pointer back to NULL
--     and the older fact is live again.
--   * agent_memory_settings holds the per-owner on/off switch. No row means on.
--     Switching off stops recall and writes but deletes nothing.
-- Apply after 20261014000000_agent_memories.sql.

ALTER TABLE agent_memories
    ADD COLUMN last_used_at TIMESTAMPTZ,
    ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN superseded_by BIGINT REFERENCES agent_memories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_memories_superseded_by
    ON agent_memories (superseded_by);

CREATE TABLE IF NOT EXISTS agent_memory_settings (
    shop_id BIGINT NOT NULL REFERENCES shops (id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shop_id, user_id)
);

-- Row-level security with no policy, as on agent_memories: Supabase's API roles see no
-- rows, while the AI service's role keeps full access.
ALTER TABLE agent_memory_settings ENABLE ROW LEVEL SECURITY;
