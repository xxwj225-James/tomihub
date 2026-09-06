-- ==========================================
-- AI-PM: Seed Data (Development)
-- ==========================================

-- Demo tenant
INSERT INTO tenants (id, name, slug, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Workspace', 'demo', 'free');

-- Demo users (password: "Demo@123")
INSERT INTO users (id, email, password_hash, display_name) VALUES
  ('00000000-0000-0000-0000-000000000010', 'alice@demo.com',
   '$2a$10$dummy_hash_placeholder', 'Alice'),
  ('00000000-0000-0000-0000-000000000011', 'bob@demo.com',
   '$2a$10$dummy_hash_placeholder', 'Bob');

-- Tenant members
INSERT INTO tenant_members (tenant_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'owner'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'member');

-- Default workflow
INSERT INTO workflows (id, tenant_id, name, states, transitions, is_default) VALUES
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001',
   'Default Workflow',
   '[
     {"key":"open","name":"待处理","category":"todo"},
     {"key":"in_progress","name":"进行中","category":"in_progress"},
     {"key":"in_review","name":"待Review","category":"in_progress"},
     {"key":"done","name":"已完成","category":"done"}
   ]'::jsonb,
   '[
     {"from":"open","to":"in_progress","name":"开始处理"},
     {"from":"in_progress","to":"in_review","name":"提交Review"},
     {"from":"in_review","to":"in_progress","name":"退回修改"},
     {"from":"in_review","to":"done","name":"通过"},
     {"from":"open","to":"done","name":"直接关闭"},
     {"from":"in_progress","to":"done","name":"直接关闭"}
   ]'::jsonb,
   TRUE);

-- Demo project
INSERT INTO projects (id, tenant_id, name, key) VALUES
  ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000001',
   'AI-PM 自建项目', 'AIPM');
