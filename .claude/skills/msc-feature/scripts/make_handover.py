#!/usr/bin/env python3
"""Validate a handover folder and zip it.

Usage:  python make_handover.py handover/<YYYY-MM-DD>-<slug>

Checks that HANDOVER.md exists and has no unfilled <placeholders> in the
required sections, that every migration and worker referenced in it exists in
the folder, and that nothing in the folder is tracked by git. Then writes
handover/<YYYY-MM-DD>-<slug>.zip next to the folder.

Standard library only. Exit code 0 on success, 1 on any problem.
"""
import os
import re
import subprocess
import sys
import zipfile

REQUIRED_SECTIONS = [
    "## 1. Scope",
    "## 2. Files changed on the branch",
    "## 3. Database migrations to run",
    "## 4. Cloudflare Workers to deploy",
    "## 6. How to test on the preview",
    "## 7. Test results",
    "## 8. Rollback",
    "## 10. Mirror branch sync",
]


def fail(msg):
    print(f"HANDOVER CHECK FAILED: {msg}")
    sys.exit(1)


def section(text, heading):
    """Return the body of the section that starts with `heading`."""
    m = re.search(re.escape(heading) + r".*?\n(.*?)(?=\n## |\Z)", text, re.S)
    return m.group(1) if m else None


def main():
    if len(sys.argv) != 2:
        fail("usage: make_handover.py handover/<date>-<slug>")
    folder = os.path.abspath(sys.argv[1].rstrip("/\\"))
    if not os.path.isdir(folder):
        fail(f"folder not found: {folder}")
    name = os.path.basename(folder)
    if not re.match(r"^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$", name):
        fail(f"folder must be named YYYY-MM-DD-<slug> (lowercase, hyphens); got {name}")

    md_path = os.path.join(folder, "HANDOVER.md")
    if not os.path.isfile(md_path):
        fail("HANDOVER.md is missing")
    with open(md_path, encoding="utf-8") as f:
        md = f.read()

    problems = []

    def has_placeholder(text):
        # Ignore inline code spans so literal HTML like `<input id="x">` is not mistaken for a placeholder.
        stripped = re.sub(r"`[^`\n]*`", "", text)
        return re.search(r"<[^>\n]{2,}>", stripped) is not None

    header = md.split("## 1. Scope", 1)[0]
    if has_placeholder(header):
        problems.append("the header (title, date, repo, branch, built by) still has <placeholders> to fill in")

    for heading in REQUIRED_SECTIONS:
        body = section(md, heading)
        if body is None:
            problems.append(f"missing section '{heading}'")
            continue
        if has_placeholder(body):
            problems.append(f"section '{heading}' still has <placeholders> to fill in")
        if not body.strip():
            problems.append(f"section '{heading}' is empty")

    # Migrations referenced in the table must exist, and vice versa.
    mig_dir = os.path.join(folder, "migrations")
    listed = set(re.findall(r"`(\d{3}_[^`]+\.sql)`", section(md, "## 3. Database migrations to run") or ""))
    present = set(os.listdir(mig_dir)) if os.path.isdir(mig_dir) else set()
    for f in listed - present:
        problems.append(f"HANDOVER.md lists migration {f} but migrations/{f} does not exist")
    for f in present - listed:
        problems.append(f"migrations/{f} exists but is not listed in section 3")
    for f in present:
        if not re.match(r"^\d{3}_[a-z0-9_]+\.sql$", f):
            problems.append(f"migration {f} must be named NNN_description.sql")

    # Workers referenced must have a folder with CHANGES.md.
    wk_dir = os.path.join(folder, "workers")
    wk_listed = set(re.findall(r"`workers/([^/`]+)/`", section(md, "## 4. Cloudflare Workers to deploy") or ""))
    wk_present = set(d for d in os.listdir(wk_dir) if os.path.isdir(os.path.join(wk_dir, d))) if os.path.isdir(wk_dir) else set()
    for w in wk_listed - wk_present:
        problems.append(f"HANDOVER.md lists worker {w} but workers/{w}/ does not exist")
    for w in wk_present - wk_listed:
        problems.append(f"workers/{w}/ exists but is not listed in section 4")
    for w in wk_present:
        if not os.path.isfile(os.path.join(wk_dir, w, "CHANGES.md")):
            problems.append(f"workers/{w}/CHANGES.md is missing")

    # No secret values anywhere in the folder.
    secret_patterns = [
        re.compile(r"eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}"),   # JWT (Supabase anon/service keys)
        re.compile(r"\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}"),   # Stripe/Razorpay-style keys
        re.compile(r"(?i)\b(secret|service_role|api[_-]?key|token|password)\b\s*[:=]\s*['\"]?[A-Za-z0-9+/_\-]{24,}"),
    ]
    for root, _, files in os.walk(folder):
        for fn in files:
            path = os.path.join(root, fn)
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    for lineno, line in enumerate(fh, 1):
                        if any(p.search(line) for p in secret_patterns):
                            problems.append(f"{os.path.relpath(path, folder)}:{lineno} looks like a secret value; write the name only")
            except OSError:
                pass

    # Nothing in the handover folder may be tracked by git.
    try:
        out = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", folder],
            capture_output=True, text=True, cwd=os.path.dirname(folder),
        )
        if out.returncode == 0 and out.stdout.strip():
            problems.append("files inside the handover folder are tracked by git; handover/ must be gitignored")
    except FileNotFoundError:
        pass

    if problems:
        print("HANDOVER CHECK FAILED:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)

    zip_path = folder + ".zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(folder):
            for fn in files:
                full = os.path.join(root, fn)
                z.write(full, os.path.join(name, os.path.relpath(full, folder)))
    print(f"OK  {zip_path}")
    print("Send this zip and the branch name to the maintainer.")


if __name__ == "__main__":
    main()
