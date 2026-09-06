"""Move unconditional ProGuard antrun executions into an opt-in profile.

For each backend module pom that has proguard-obfuscate OUTSIDE a profile,
rewrite <build><plugins>: the leading maven-dependency-plugin (proguard-libjars)
and maven-antrun-plugin (proguard-obfuscate) blocks move into
<profile><id>obfuscate</id><build><plugins>...</plugins></build></profile>,
leaving any remaining plugins (spring-boot / compiler) in <build>.
"""
import re
import sys

MODULES = ["ai-pm-auth", "ai-pm-core", "ai-pm-gateway",
           "ai-pm-notification", "ai-pm-tenant", "ai-pm-webhook"]
ROOT = "backend"


def fix(path: str) -> bool:
    text = open(path, encoding="utf-8").read()
    if "proguard-obfuscate" not in text:
        return False
    if re.search(r"<profile>\s*<id>obfuscate</id>", text):
        return False  # already profiled

    # Locate the <build> ... </build> region.
    m = re.search(r"<build>(.*?)</build>", text, re.DOTALL)
    if not m:
        print(f"  [!] {path}: no <build> block")
        return False
    build_body = m.group(1)

    # Split plugins: capture plugin blocks by balanced-ish tag scan (plugins
    # here contain no nested <plugin> inside, so a simple non-greedy scan of
    # '<plugin>...</plugin>' works).
    plugin_re = re.compile(r"<plugin>.*?</plugin>", re.DOTALL)
    plugins = plugin_re.findall(build_body)
    if not plugins:
        print(f"  [!] {path}: no <plugin> blocks found")
        return False

    # The proguard pair are the first two plugins that mention proguard.
    proguard_plugins = []
    rest_plugins = []
    for p in plugins:
        if "proguard" in p:
            proguard_plugins.append(p)
        else:
            rest_plugins.append(p)

    if not proguard_plugins:
        print(f"  [!] {path}: proguard plugins not found in build")
        return False

    # Keep leading <plugins> wrapper spacing tidy.
    indent_plugins = "\n".join(
        "        " + p for p in rest_plugins) if rest_plugins else ""
    indent_pro = "\n".join(
        "                    " + p for p in proguard_plugins)

    new_build = f"""    <build>
        <plugins>{indent_plugins}
        </plugins>
    </build>

    <profiles>
        <profile>
            <id>obfuscate</id>
            <build>
                <plugins>
{indent_pro}
                </plugins>
            </build>
        </profile>
    </profiles>"""

    new_text = text[: m.start()] + new_build + text[m.end():]
    # Drop any now-empty <profiles> from parent duplication? None — modules
    # don't declare profiles. Validate XML.
    import xml.dom.minidom
    try:
        xml.dom.minidom.parseString(new_text)
    except Exception as e:
        print(f"  [!] {path}: generated XML invalid: {e}")
        return False
    open(path, "w", encoding="utf-8").write(new_text)
    print(f"  [ok] {path}")
    return True


def main():
    changed = 0
    for mod in MODULES:
        p = f"{ROOT}/{mod}/pom.xml"
        try:
            if fix(p):
                changed += 1
        except FileNotFoundError:
            print(f"  [skip] {p} not found")
    print(f"done: {changed} poms moved to opt-in obfuscate profile")


if __name__ == "__main__":
    main()
