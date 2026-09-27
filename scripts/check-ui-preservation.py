#!/usr/bin/env python3
"""Compare UI work to a Git snapshot without modifying the checkout.
Checks every generated job's title, description, location/pay/category metadata,
JSON-LD, and real application contacts; checks all assets/database files bytewise.
CV template bodies are compared separately from editable app/editor code.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tarfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def values(pattern, source):
    return re.findall(pattern, source, re.S)


def job_data(source):
    return {
        'heading': values(r'<h1\b[^>]*>.*?</h1>', source),
        'description': values(r'<div class="description-content">.*?</div>', source),
        # Relative labels may be replaced with the absolute date already stored in
        # JSON-LD. Location, pay, category and all other metadata remain identical.
        'metadata': [re.sub(r'<span>Posted\s+[^<]*</span>', '<span>Posted [presentation]</span>', v) for v in values(r'<div class="job-meta-item">.*?</div>', source)],
        'structured_data': values(r'<script type="application/ld\+json">.*?</script>', source),
        'application_contacts': [v for v in values(r'<span class="apply-link-text">(.*?)</span>', source) if v not in {'#', 'Check the job portal'}],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-ref', default='HEAD')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = subprocess.check_output(['git', 'rev-parse', args.baseline_ref], cwd=ROOT, text=True).strip()
    proc = subprocess.Popen(['git', 'archive', baseline, 'jobs', 'assets', 'database', 'supabase', 'cv-builder'], cwd=ROOT, stdout=subprocess.PIPE)
    counts = Counter()
    failures = []
    seen = set()
    with tarfile.open(fileobj=proc.stdout, mode='r|') as archive:
        for member in archive:
            if not member.isfile():
                continue
            path = member.name
            seen.add(path)
            before = archive.extractfile(member).read()
            current = ROOT / path
            if not current.is_file():
                failures.append({'path': path, 'issue': 'missing-original-file'})
                continue
            after = current.read_bytes()
            if path.startswith('jobs/') and path.endswith('.html'):
                counts['generated_jobs'] += 1
                if job_data(before.decode()) != job_data(after.decode()):
                    failures.append({'path': path, 'issue': 'job-data-changed'})
            elif path.startswith(('assets/', 'database/', 'supabase/')):
                counts['asset_and_database_files'] += 1
                if before != after:
                    failures.append({'path': path, 'issue': 'asset-or-database-content-changed', 'before_sha256': hashlib.sha256(before).hexdigest(), 'after_sha256': hashlib.sha256(after).hexdigest()})
            elif path.startswith('cv-builder/') and path.endswith('.html') and path != 'cv-builder/index.html':
                counts['cv_templates'] += 1
                if values(r'<body\b[^>]*>.*?</body>', before.decode()) != values(r'<body\b[^>]*>.*?</body>', after.decode()):
                    failures.append({'path': path, 'issue': 'cv-template-body-changed'})
    if proc.wait() != 0:
        raise RuntimeError('Unable to read Git snapshot')
    report = {'baseline_commit': baseline, 'checks': dict(counts), 'original_files_checked': len(seen), 'passed': not failures, 'failures': failures}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
