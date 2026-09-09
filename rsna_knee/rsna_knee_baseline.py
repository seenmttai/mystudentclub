"""RSNA Knee Abnormality Detection: Qwen report labels + MRI pilot.

Designed to run as one Kaggle notebook cell after attaching the competition
dataset. The defaults intentionally keep the first experiment bounded.
"""

from __future__ import annotations

import ast
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd


LABELS = [
    "ACL", "MCL", "Medial Meniscus", "Lateral Meniscus", "Medial OA",
    "Lateral OA", "PF OA", "Effusion", "Synovitis", "Baker's", "Contusion", "Fracture",
]


def find_competition_root() -> Path:
    candidates = [
        Path("/kaggle/input/rsna-knee-abnormality-detection"),
        Path("/kaggle/input/rsna-knee-abnormalities-detection"),
    ]
    for candidate in candidates:
        if (candidate / "train.csv").exists():
            return candidate
    for candidate in Path("/kaggle/input").glob("*"):
        if (candidate / "train.csv").exists() and (candidate / "train_series.csv").exists():
            return candidate
    raise FileNotFoundError("Could not locate train.csv and train_series.csv under /kaggle/input")


def soft_install(package: str) -> None:
    """Install only when the Kaggle image does not already contain a package."""
    module = package.split("==")[0].replace("-", "_")
    if __import__("importlib.util").util.find_spec(module) is None:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", package])


def build_prompt(report: str) -> str:
    schema = ", ".join(f'"{label}": 0.5' for label in LABELS)
    return f"""You are a careful musculoskeletal radiology labeler. Read the report below and return ONLY one JSON object with exactly these twelve keys: {', '.join(LABELS)}.

For every key, output a probability in [0.0, 1.0] that the report supports the competition's finding. Use 0.90 for a clearly affirmed definite finding, 0.70 for a likely or mild finding, 0.30 for a suspected/uncertain finding, 0.10 for a clearly negated finding, and exactly 0.50 when the finding is not addressed or the report is too ambiguous. Respect negation and the report language. Do not infer an unmentioned finding from another finding. Return no prose, markdown, or extra keys.

JSON shape example: {{{schema}}}

REPORT:
{report[:12000]}"""


def parse_scores(text: str) -> dict[str, float]:
    text = text.replace("```json", "").replace("```", "").strip()
    candidates = re.findall(r"\{.*\}", text, flags=re.S)
    obj = None
    for candidate in reversed(candidates):
        try:
            obj = json.loads(candidate)
            break
        except json.JSONDecodeError:
            try:
                obj = ast.literal_eval(candidate)
                break
            except (ValueError, SyntaxError):
                pass
    if not isinstance(obj, dict):
        return {label: 0.5 for label in LABELS}
    out = {}
    for label in LABELS:
        try:
            value = float(obj.get(label, 0.5))
        except (TypeError, ValueError):
            value = 0.5
        out[label] = float(np.clip(value, 0.0, 1.0))
    return out


def label_reports(train: pd.DataFrame, output_path: Path) -> pd.DataFrame:
    """Generate or resume Qwen/vLLM report labels."""
    if output_path.exists():
        cached = pd.read_csv(output_path)
        if len(cached) == len(train) and all(label in cached for label in LABELS):
            print(f"Using cached report labels: {output_path}")
            return cached

    soft_install("vllm>=0.17.0")
    from vllm import LLM, SamplingParams

    model_name = os.environ.get("QWEN_MODEL", "QuantTrio/Qwen3.5-9B-AWQ")
    gpu_count = int(os.environ.get("CUDA_VISIBLE_DEVICES", "0,1").count(",") + 1)
    llm = LLM(
        model=model_name,
        tensor_parallel_size=max(1, gpu_count),
        max_model_len=4096,
        gpu_memory_utilization=0.90,
        trust_remote_code=True,
    )
    params = SamplingParams(temperature=0.0, top_p=1.0, max_tokens=320)
    prompts = [build_prompt(report if isinstance(report, str) else "") for report in train["Report"]]
    outputs = llm.generate(prompts, params)
    rows = []
    for output in outputs:
        generated = output.outputs[0].text if output.outputs else ""
        rows.append(parse_scores(generated))
    labels = pd.DataFrame(rows)
    labels.insert(0, "StudyInstanceUID", train["StudyInstanceUID"].values)
    labels.to_csv(output_path, index=False)
    print(f"Saved {len(labels)} Qwen report labels to {output_path}")
    return labels


def choose_series(series: pd.DataFrame) -> pd.DataFrame:
    series = series.copy()
    series["score"] = (
        4 * series["Fluid_Sensitive"].fillna(0).astype(int)
        + 2 * series["Fat_Suppression"].fillna(0).astype(int)
        + series["Anatomical_Plane"].eq("Sagittal").astype(int)
    )
    return series.sort_values(["StudyInstanceUID", "score"], ascending=[True, False]).drop_duplicates("StudyInstanceUID")


def make_slice_index(root: Path, series: pd.DataFrame, study_ids: set[str]) -> list[tuple[str, list[Path]]]:
    selected = choose_series(series[series["StudyInstanceUID"].isin(study_ids)])
    items = []
    for row in selected.itertuples(index=False):
        folder = root / "train_series" / str(row.StudyInstanceUID) / str(row.SeriesInstanceUID)
        files = sorted(folder.glob("*.dcm"))
        if not files:
            continue
        positions = np.linspace(0, len(files) - 1, 3).round().astype(int)
        items.append((str(row.StudyInstanceUID), [files[i] for i in positions]))
    return items


def train_mri_pilot(root: Path, labels: pd.DataFrame, output_dir: Path) -> None:
    import torch
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import train_test_split
    from torch import nn
    from torch.utils.data import DataLoader, Dataset
    from torchvision.models import ResNet18_Weights, resnet18

    import pydicom
    from PIL import Image

    seed = int(os.environ.get("SEED", "42"))
    max_studies = int(os.environ.get("MAX_STUDIES", "512"))
    epochs = int(os.environ.get("EPOCHS", "1"))
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    series = pd.read_csv(root / "train_series.csv")
    labeled = labels.dropna(subset=["StudyInstanceUID"]).copy()
    study_ids = labeled["StudyInstanceUID"].astype(str).tolist()
    if max_studies > 0:
        study_ids = study_ids[:max_studies]
    study_ids = set(study_ids)
    index = make_slice_index(root, series, study_ids)
    if len(index) < 16:
        raise RuntimeError(f"Only {len(index)} usable studies found; check DICOM paths")
    label_lookup = labeled.set_index("StudyInstanceUID")[LABELS]
    train_ids, valid_ids = train_test_split([x[0] for x in index], test_size=0.2, random_state=seed)

    class KneeDataset(Dataset):
        def __init__(self, rows: list[tuple[str, list[Path]]]):
            self.rows = rows

        def __len__(self):
            return len(self.rows)

        @staticmethod
        def read_slice(path: Path) -> np.ndarray:
            ds = pydicom.dcmread(path, force=True)
            arr = ds.pixel_array.astype(np.float32)
            arr = np.nan_to_num(arr)
            lo, hi = np.percentile(arr, [1, 99])
            arr = np.clip((arr - lo) / max(hi - lo, 1e-6), 0, 1)
            image = Image.fromarray((arr * 255).astype(np.uint8)).resize((224, 224))
            return np.asarray(image, dtype=np.float32) / 255.0

        def __getitem__(self, idx: int):
            uid, paths = self.rows[idx]
            image = np.stack([self.read_slice(path) for path in paths], axis=0)
            x = torch.from_numpy(image).float()
            x = (x - 0.5) / 0.25
            y = torch.tensor(label_lookup.loc[uid].to_numpy(dtype=np.float32))
            return x, y

    by_id = {uid: paths for uid, paths in index}
    train_ds = KneeDataset([(uid, by_id[uid]) for uid in train_ids])
    valid_ds = KneeDataset([(uid, by_id[uid]) for uid in valid_ids])
    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, num_workers=2, pin_memory=True)
    valid_loader = DataLoader(valid_ds, batch_size=16, shuffle=False, num_workers=2, pin_memory=True)

    try:
        model = resnet18(weights=ResNet18_Weights.DEFAULT)
    except Exception as exc:
        print(f"Pretrained weights unavailable ({exc}); using random initialization")
        model = resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, len(LABELS))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=1e-4)
    criterion = nn.BCEWithLogitsLoss()

    for epoch in range(epochs):
        model.train()
        losses = []
        for x, y in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(x.to(device, non_blocking=True)), y.to(device, non_blocking=True))
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        print(f"epoch={epoch + 1}/{epochs} train_loss={np.mean(losses):.5f}")

    model.eval()
    truth, pred = [], []
    with torch.no_grad():
        for x, y in valid_loader:
            pred.append(torch.sigmoid(model(x.to(device))).cpu().numpy())
            truth.append(y.numpy())
    truth = np.concatenate(truth)
    pred = np.concatenate(pred)
    aucs = []
    for col in range(len(LABELS)):
        if len(np.unique(truth[:, col])) > 1:
            aucs.append(roc_auc_score(truth[:, col], pred[:, col]))
    macro_auc = float(np.mean(aucs)) if aucs else float("nan")
    print(f"validation_macro_auc={macro_auc:.5f} on {len(valid_ds)} studies")

    output_dir.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "labels": LABELS}, output_dir / "resnet18_2p5d_pilot.pt")
    pd.DataFrame({"label": LABELS[:len(aucs)], "auc": aucs}).to_csv(output_dir / "validation_auc.csv", index=False)


def main() -> None:
    root = find_competition_root()
    output_dir = Path("/kaggle/working/rsna_knee_outputs")
    train = pd.read_csv(root / "train.csv")
    print(f"root={root} train_shape={train.shape}")
    print(f"gold_rows={train[LABELS].notna().all(axis=1).sum()} report_rows={train['Report'].notna().sum()}")
    labels = label_reports(train[["StudyInstanceUID", "Report"]], output_dir / "qwen_report_labels.csv")
    merged = train[["StudyInstanceUID"]].merge(labels, on="StudyInstanceUID", how="left")
    train_mri_pilot(root, merged, output_dir)


if __name__ == "__main__":
    main()
