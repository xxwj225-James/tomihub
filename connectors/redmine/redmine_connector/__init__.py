"""
Redmine AI Connector — continuous sync from Redmine into the TomiHub data model.

R1 of open-core-plan §3.5: bridge Redmine (existing project management) into
ai-brain's analysis pipeline by mirroring its data into TomiHub tables.

Modules:
  rest_client.py — Redmine REST API client (paginated / cursor reads)
  mapper.py      — Redmine → TomiHub model mapping (pure functions)
  sync.py        — sync orchestration (full init + incremental)
  state.py       — sync cursor / state persistence

See docs/redmine-connector-design.md.
"""
