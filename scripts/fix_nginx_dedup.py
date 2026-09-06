"""Deduplicate neutralized nginx AI blocks (temp fixer)."""
import re
import sys

p = sys.argv[1]
text = open(p, encoding="utf-8").read()

# Match a full neutralized AI location block (single or multi line).
block_re = re.compile(
    r"[ \t]*location ~ \^/api/v1/\(ai\|redmine\|mcp\) \{.*?\n?[ \t]*\}",
    re.DOTALL)
blocks = block_re.findall(text)
print("found blocks:", len(blocks))
if len(blocks) > 1:
    keep = blocks[0]
    text = text.replace(keep, "@@KEEP@@", 1)
    for b in blocks[1:]:
        text = text.replace(b, "")
    text = text.replace("@@KEEP@@", keep)

# Strip now-orphaned AI comment headers left behind
text = re.sub(r"\n\s*# (AI endpoints|Redmine plugin|MCP) →[^\n]*", "", text)
text = re.sub(r"\n\s*# (AI endpoints|Redmine plugin|MCP) [^\n]*ai-brain[^\n]*", "", text)

open(p, "w", encoding="utf-8").write(text)
nc = re.sub(r"#.*", "", text)
depth = sum(1 if c == "{" else (-1 if c == "}" else 0) for c in nc)
print("brace depth:", depth)
print("ai_unavailable now:", text.count("ai_unavailable"))
