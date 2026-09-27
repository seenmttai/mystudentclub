#!/usr/bin/env python3
"""Read-only, dependency-free UI/source inventory. Findings require runtime review.
Usage: python3 scripts/audit-ui.py --output /absolute/path/report.json
Audits every deployable HTML document, including each generated job and CV frame.
Does not submit forms, call authenticated services, mutate content, or crawl third parties.
"""
import argparse, collections, hashlib, json, re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

ROOT = Path(__file__).resolve().parent.parent
SKIP = {'.git', 'node_modules', 'work', 'scratch', 'tests', 'dist', '.astro'}
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
INTERNAL = {'admin.html','hirer-dashboard.html','mentor-dashboard.html','auth-test.html','browser-guard-test.html','moonshine-test.html','payment-test.html','speak-test.html','testing.html','turnstile-test.html','blog/admin/index.html','blog/test.html','ca-industrial-training-program/test.html','msc-ca-fresher-program/test.html'}
ORIGINS = {'www.mystudentclub.com','mystudentclub.com','mystudentclub.pages.dev'}

class Doc(HTMLParser):
    def __init__(self, filename, source):
        super().__init__(convert_charrefs=True)
        self.filename=filename; self.source=source; self.nodes=[]; self.stack=[]; self.text=[]
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        node={'tag':tag,'attrs':attrs,'line':self.getpos()[0],'text':[],'ancestors':list(self.stack)}
        self.nodes.append(node)
        if tag not in VOID: self.stack.append(len(self.nodes)-1)
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.nodes[self.stack[i]]['tag']==tag:
                self.stack=self.stack[:i]; break
    def handle_data(self, value):
        if any(self.nodes[i]['tag'] in {'script','style'} for i in self.stack): return
        if value.strip(): self.text.append(value.strip())
        for i in self.stack: self.nodes[i]['text'].append(value)

def family(path):
    if path == '404.html': return 'error-page'
    if path.startswith('jobs/'): return 'generated-job'
    if path.startswith('cv-builder/') and path!='cv-builder/index.html': return 'cv-template'
    if path in INTERNAL or path.endswith('-test.html') or path.startswith('google'): return 'internal-or-test'
    if 'booklet/' in path or 'guidebook/' in path or 'hiring-logic/' in path: return 'resource-reader'
    if '-program/' in path: return 'program'
    if path.startswith('learning-management-system/'): return 'learning'
    if path in {'index.html','articleship.html','fresher.html','semi-qualified.html','experienced-ca.html'}: return 'job-portal'
    if path.endswith('-resources.html'): return 'resource-library'
    return 'public-application'

def route(path):
    return '/'+('' if path=='index.html' else path[:-10] if path.endswith('index.html') else path)

def resolve_asset(url):
    path=unquote(urlparse(url).path).lstrip('/')
    p=ROOT/path
    candidates=[p,Path(str(p)+'.html'),p/'index.html']
    return next((q.relative_to(ROOT).as_posix() for q in candidates if q.is_file()),None)

def audit():
    paths=sorted(p for p in ROOT.rglob('*.html') if not any(x in SKIP for x in p.relative_to(ROOT).parts))
    docs={p.relative_to(ROOT).as_posix():Doc(p.relative_to(ROOT).as_posix(),p.read_text(errors='replace')) for p in paths}
    findings=[]; pages=[]; links=[]; controls=[]; copy=[]; destinations=collections.Counter()
    def issue(code,p,node=None,**extra):
        findings.append({'code':code,'page':p,'family':family(p),'line':node['line'] if node else 1,**extra})
    for path,d in docs.items():
        ids=collections.Counter(n['attrs']['id'] for n in d.nodes if n['attrs'].get('id'))
        label_ids={n['attrs'].get('for') for n in d.nodes if n['tag']=='label'}
        title='';h1=[];link_count=0;control_count=0
        base_node=next((n for n in d.nodes if n['tag']=='base' and n['attrs'].get('href')),None)
        base=urljoin('https://www.mystudentclub.com/'+path,base_node['attrs']['href']) if base_node else 'https://www.mystudentclub.com/'+path
        for ident,count in ids.items():
            if count>1: issue('duplicate-id',path,id=ident,count=count)
        for n in d.nodes:
            tag=n['tag'];a=n['attrs'];txt=' '.join(''.join(n['text']).split())
            if tag=='title': title=txt
            if tag=='h1':h1.append(txt)
            if tag=='img' and 'alt' not in a: issue('image-without-alt',path,n,src=a.get('src'))
            if tag=='meta' and a.get('name')=='viewport' and re.search(r'user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:,|$)',a.get('content','')):issue('zoom-disabled',path,n,content=a['content'])
            if tag in {'button','input','select','textarea','summary'}:
                if tag=='input' and a.get('type')=='hidden':continue
                control_count+=1
                named=bool(a.get('aria-label') or a.get('aria-labelledby') or a.get('title') or txt or (a.get('id') in label_ids) or any(d.nodes[i]['tag']=='label' for i in n['ancestors']))
                if tag=='input' and a.get('type') in {'submit','reset','button'}:named=bool(a.get('value'))
                if not named:issue('control-needs-name-review',path,n,tag=tag,id=a.get('id'),placeholder=a.get('placeholder'),type=a.get('type'))
                if family(path) not in {'generated-job','cv-template'}:controls.append({'page':path,'line':n['line'],'tag':tag,'id':a.get('id'),'text':txt[:200],'aria_label':a.get('aria-label'),'type':a.get('type')})
            if tag=='a' and 'href' in a:
                link_count+=1
                href=a.get('href') or ''; handler=bool(a.get('onclick'))
                if href in {'','#','javascript:void(0)','javascript:void(0);'} and not handler:issue('placeholder-link-review',path,n,text=txt[:160],href=href,id=a.get('id'))
                if not txt and not a.get('aria-label') and not a.get('title') and not any(x['tag']=='img' and x['attrs'].get('alt') and d.nodes.index(n) in x['ancestors'] for x in d.nodes):
                    issue('link-needs-name-review',path,n,href=href,id=a.get('id'))
                if any(d.nodes[i]['tag'] in {'button','a'} for i in n['ancestors']):issue('nested-interactive',path,n,tag=tag,href=href)
            attr='src' if tag in {'script','img','iframe','source','video','audio'} else 'href' if tag in {'link','a'} else None
            if attr and a.get(attr):
                href=a[attr]
                if href.startswith(('data:','mailto:','tel:','javascript:','blob:')) or '${' in href or '{{' in href:continue
                resolved=urljoin(base,href);u=urlparse(resolved)
                if u.netloc not in ORIGINS: continue
                target=resolve_asset(resolved)
                if tag=='a':
                    destinations[u.path]+=1
                    if family(path) not in {'generated-job','cv-template'}:links.append({'page':path,'line':n['line'],'text':txt[:200],'href':href,'target':target})
                if not target and not u.path.startswith('/api/') and u.path!='/terms':issue('missing-local-target',path,n,tag=tag,href=href,resolved_path=u.path)
                if target and u.fragment and tag=='a' and target in docs:
                    target_ids={x['attrs'].get('id') for x in docs[target].nodes}|{x['attrs'].get('name') for x in docs[target].nodes}
                    if unquote(u.fragment) not in target_ids and not href.startswith('#:~:'):issue('fragment-needs-runtime-review',path,n,href=href,target=target)
        robots=[n['attrs'].get('content','') for n in d.nodes if n['tag']=='meta' and n['attrs'].get('name')=='robots']
        if len(robots)>1 and any('noindex' in r for r in robots) and any(re.search(r'(^|,\s*)index',r) for r in robots):issue('conflicting-robots',path,values=robots)
        if not title:issue('missing-title',path)
        if family(path) not in {'cv-template','internal-or-test'} and not h1:issue('missing-h1-review',path)
        if family(path) not in {'cv-template','internal-or-test'} and '/scripts/site-navigation.js' not in d.source:issue('missing-shared-navigation',path)
        pages.append({'path':path,'route':route(path),'family':family(path),'title':title,'h1':h1,'bytes':len(d.source.encode()),'sha256':hashlib.sha256(d.source.encode()).hexdigest(),'link_count':link_count,'control_count':control_count,'has_shared_navigation':'/scripts/site-navigation.js' in d.source,'robots':robots,'expected_error_page':path=='404.html'})
        if family(path) not in {'generated-job','cv-template'}:copy.append({'page':path,'text':'\n'.join(d.text)})
    for f in findings:
        f['scope']='supporting-document' if f['family'] in {'internal-or-test','cv-template'} else 'public'
    return {'generated_at':datetime.now(timezone.utc).isoformat(),'root':str(ROOT),'method':'Static HTML parser; missing names, fragments, placeholders and h1 are review candidates, not runtime conformance claims. Existing JS may supply names, fragments, content and handlers. No form submitted.','summary':{'html_documents':len(pages),'families':dict(collections.Counter(p['family'] for p in pages)),'finding_counts':dict(collections.Counter(f['code'] for f in findings)),'public_finding_counts':dict(collections.Counter(f['code'] for f in findings if f['scope']=='public'))},'pages':pages,'findings':findings,'controls_unique_apps':controls,'internal_links_unique_apps':links,'copy_unique_apps':copy}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True);args=parser.parse_args()
    result=audit();out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2,ensure_ascii=False))
    print(json.dumps(result['summary'],indent=2));print('Saved:',out)
