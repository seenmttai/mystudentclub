import os, re, random, json
from pathlib import Path
import numpy as np
import pandas as pd

LABELS = ["ACL", "MCL", "Medial Meniscus", "Lateral Meniscus", "Medial OA",
          "Lateral OA", "PF OA", "Effusion", "Synovitis", "Baker's",
          "Contusion", "Fracture"]

def find_root():
    for p in [Path('/kaggle/input/rsna-knee-abnormality-detection'),
              Path('/kaggle/input/rsna-knee-abnormalities-detection')]:
        if (p/'train.csv').exists(): return p
    for p in Path('/kaggle/input').glob('*'):
        if (p/'train.csv').exists() and (p/'train_series.csv').exists(): return p
    raise FileNotFoundError('RSNA competition files not found')

def weak_targets(report):
    t = str(report or '').lower()
    neg = r'(?:no|without|negative for|absent|intact|unremarkable|normal|preserved|maintained|free of)'
    out = {}
    rules = {
        'ACL': [r'\bacl\b', r'anterior cruciate'],
        'MCL': [r'\bmcl\b', r'medial collateral'],
        'Medial Meniscus': [r'medial meniscus'],
        'Lateral Meniscus': [r'lateral meniscus'],
        'Medial OA': [r'medial (?:compartment|femorotibial|tibiofemoral)', r'medial.{0,25}(?:osteoarthritis|arthrosis|cartilage loss|chondral)'],
        'Lateral OA': [r'lateral (?:compartment|femorotibial|tibiofemoral)', r'lateral.{0,25}(?:osteoarthritis|arthrosis|cartilage loss|chondral)'],
        'PF OA': [r'patellofemoral', r'\bpfj\b', r'patellar.{0,25}(?:osteoarthritis|arthrosis|chondral)'],
        'Effusion': [r'effusion', r'joint fluid'],
        'Synovitis': [r'synovitis', r'synovial thickening'],
        "Baker's": [r"baker(?:'s|s)? cyst", r'popliteal cyst'],
        'Contusion': [r'contusion', r'bone bruise', r' marrow edema'],
        'Fracture': [r'fracture', r'fractured', r'cortical break'],
    }
    for lab, pats in rules.items():
        hits = [m for p in pats for m in re.finditer(p, t)]
        positive = False; negative = False
        for m in hits:
            context = t[max(0, m.start()-45):m.start()]
            if re.search(neg + r'[^.]{0,35}$', context): negative = True
            else: positive = True
        out[lab] = 0.08 if negative and not positive else (0.92 if positive else 0.50)
    return np.asarray([out[x] for x in LABELS], dtype=np.float32)

def pick_series(series):
    s = series.copy()
    study = next((c for c in s.columns if c.lower() == 'studyinstanceuid'), s.columns[0])
    ser = next((c for c in s.columns if c.lower() == 'seriesinstanceuid'), s.columns[1])
    desc = next((c for c in s.columns if 'description' in c.lower()), None)
    count = next((c for c in s.columns if c.lower() in {'numimages','numberofimages','imagecount'}), None)
    s['_study'] = s[study].astype(str); s['_series'] = s[ser].astype(str)
    s['_desc'] = s[desc].fillna('').astype(str).str.lower() if desc else ''
    if count: s['_count'] = pd.to_numeric(s[count], errors='coerce').fillna(0)
    else: s['_count'] = 0
    s['_score'] = (s['_desc'].str.contains('sagittal').astype(int)*5 +
                   s['_desc'].str.contains('coronal').astype(int)*4 +
                   s['_desc'].str.contains('axial').astype(int)*2 +
                   s['_desc'].str.contains('fat|fs|stir|pd', regex=True).astype(int)*3 +
                   np.log1p(s['_count']))
    return s.sort_values(['_study','_score'], ascending=[True,False]).drop_duplicates('_study')

def build_index(root, series, ids):
    s = pick_series(series[series.iloc[:,0].astype(str).isin(ids)] if series.iloc[:,0].astype(str).isin(ids).any() else series)
    if not set(ids).issubset(set(s['_study'])):
        s = pick_series(series[series['_study'].astype(str).isin(ids)] if '_study' in series else series)
    rows=[]
    for r in s.itertuples(index=False):
        uid = str(getattr(r, '_study')); sid = str(getattr(r, '_series'))
        if uid not in ids: continue
        folder = root/'train_series'/uid/sid
        files = sorted(folder.glob('*.dcm'))
        if len(files) < 1: continue
        q = np.linspace(0, len(files)-1, 3).round().astype(int)
        rows.append((uid, [files[int(i)] for i in q]))
    return rows

def run():
    import torch
    from torch import nn
    from torch.utils.data import Dataset, DataLoader
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import train_test_split
    import pydicom
    from PIL import Image
    from torchvision.models import resnet18

    seed=42; random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    root=find_root(); out=Path('/kaggle/working/rsna_knee_pilot'); out.mkdir(exist_ok=True)
    train=pd.read_csv(root/'train.csv'); series=pd.read_csv(root/'train_series.csv')
    train['StudyInstanceUID']=train['StudyInstanceUID'].astype(str)
    gold=train[train[LABELS].notna().all(axis=1)].copy()
    ids=gold['StudyInstanceUID'].tolist()
    test_ids, rem = train_test_split(ids, test_size=0.80, random_state=seed)
    val_ids, train_gold_ids = train_test_split(rem, test_size=0.80, random_state=seed)
    test_ids=set(test_ids); val_ids=set(val_ids); train_gold_ids=set(train_gold_ids)
    assert not (test_ids & val_ids or test_ids & train_gold_ids or val_ids & train_gold_ids)
    print(f'root={root} train={train.shape} series={series.shape} gold={len(gold)}')
    print(f'strict split: train_gold={len(train_gold_ids)} val={len(val_ids)} test={len(test_ids)}')

    # Weak report targets are used only for non-held-out studies and never for validation/test.
    weak = train[~train['StudyInstanceUID'].isin(test_ids|val_ids|train_gold_ids)].copy()
    weak['weak_y'] = weak['Report'].map(weak_targets)
    weak = weak.sample(n=min(600, len(weak)), random_state=seed)
    target = {str(r.StudyInstanceUID):r[LABELS].to_numpy(np.float32) for _,r in gold.iterrows() if str(r.StudyInstanceUID) in train_gold_ids}
    target.update({str(r.StudyInstanceUID):r.weak_y for _,r in weak.iterrows()})
    all_ids=set(target)
    index=build_index(root, series, all_ids | val_ids | test_ids)
    by_id={u:p for u,p in index}
    train_rows=[(u,by_id[u]) for u in target if u in by_id]
    val_rows=[(u,by_id[u]) for u in val_ids if u in by_id]
    test_rows=[(u,by_id[u]) for u in test_ids if u in by_id]
    print(f'usable studies: train={len(train_rows)} val={len(val_rows)} strict_test={len(test_rows)}')
    if len(val_rows)<3 or len(test_rows)<3: raise RuntimeError('Too few DICOM studies indexed')
    label_map=target
    class Knee(Dataset):
        def __init__(self, rows, labels): self.rows=rows; self.labels=labels
        def __len__(self): return len(self.rows)
        def __getitem__(self,i):
            uid,paths=self.rows[i]; chans=[]
            for path in paths:
                try:
                    a=pydicom.dcmread(path, force=True).pixel_array.astype(np.float32)
                    a=np.nan_to_num(a); lo,hi=np.percentile(a,[1,99]); a=np.clip((a-lo)/max(hi-lo,1e-6),0,1)
                    a=np.asarray(Image.fromarray((a*255).astype(np.uint8)).resize((192,192)),np.float32)/255
                except Exception: a=np.zeros((192,192),np.float32)
                chans.append(a)
            x=torch.from_numpy(np.stack(chans)).float(); x=(x-.5)/.25
            return x,torch.tensor(self.labels[uid],dtype=torch.float32),uid
    tr=DataLoader(Knee(train_rows,label_map),batch_size=8,shuffle=True,num_workers=0)
    va=DataLoader(Knee(val_rows,{u:gold.set_index('StudyInstanceUID').loc[u,LABELS].to_numpy(np.float32) for u in val_ids if u in by_id}),batch_size=8,num_workers=0)
    te=DataLoader(Knee(test_rows,{u:gold.set_index('StudyInstanceUID').loc[u,LABELS].to_numpy(np.float32) for u in test_ids if u in by_id}),batch_size=8,num_workers=0)
    model=resnet18(weights=None); model.fc=nn.Linear(model.fc.in_features,12)
    dev=torch.device('cuda' if torch.cuda.is_available() else 'cpu'); model.to(dev)
    opt=torch.optim.AdamW(model.parameters(),lr=3e-4,weight_decay=1e-4); loss_fn=nn.BCEWithLogitsLoss()
    def evaluate(loader):
        model.eval(); ys=[]; ps=[]
        with torch.no_grad():
            for x,y,_ in loader: ys.append(y.numpy()); ps.append(torch.sigmoid(model(x.to(dev))).cpu().numpy())
        y=np.concatenate(ys); p=np.concatenate(ps); auc=[]
        for j in range(12):
            if len(np.unique(y[:,j]))>1: auc.append(roc_auc_score(y[:,j],p[:,j]))
        auc=float(np.mean(auc)) if auc else float('nan'); bacc=float(((p>=.5)==y).mean()); exact=float(((p>=.5)==y).all(1).mean())
        return auc,bacc,exact
    best=-1
    for epoch in range(3):
        model.train(); ls=[]
        for x,y,_ in tr:
            opt.zero_grad(set_to_none=True); z=model(x.to(dev)); l=loss_fn(z,y.to(dev)); l.backward(); opt.step(); ls.append(float(l.detach().cpu()))
        va_m=evaluate(va); te_m=evaluate(te)
        print(f'epoch={epoch+1}/3 loss={np.mean(ls):.5f} val_auc={va_m[0]:.4f} val_acc={va_m[1]:.4f} test_auc={te_m[0]:.4f} test_acc={te_m[1]:.4f} test_exact={te_m[2]:.4f}')
        if va_m[0]>best: best=va_m[0]; torch.save({'model':model.state_dict(),'labels':LABELS,'seed':seed},out/'best.pt')
        pd.DataFrame([{'epoch':epoch+1,'val_auc':va_m[0],'val_binary_accuracy':va_m[1],'strict_test_auc':te_m[0],'strict_test_binary_accuracy':te_m[1],'strict_test_exact_match':te_m[2]}]).to_csv(out/'metrics.csv',mode='a',header=not (out/'metrics.csv').exists(),index=False)
    print(f'saved={out} best_val_auc={best:.4f}')

run()
