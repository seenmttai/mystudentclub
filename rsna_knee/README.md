# RSNA Knee Abnormality Detection

Kaggle baseline for the 12-label RSNA knee MRI competition.

The pipeline is deliberately split into two stages:

1. Read multilingual radiology reports with Qwen3.5-9B AWQ through vLLM and write soft labels. A finding that is not addressed is assigned 0.5 rather than being forced to negative.
2. Train a small 2.5D ResNet18 on three representative DICOM slices per study using the report-derived labels. The notebook defaults to a small pilot (`MAX_STUDIES=512`, one epoch) so it can be expanded after the data path and runtime are verified.

The Kaggle notebook created for this run is:

`https://www.kaggle.com/code/seenmttai/notebook48a4a1d1ba/edit`

The competition metric is macro-averaged ROC AUC over the twelve targets. This is a baseline for validating the end-to-end plumbing, not a final leaderboard recipe.
# Persistent Kaggle workflow notes

- If the CUA session resets, reconnect by re-listing the Edge extension browser, matching the exact Kaggle tab URL and provider ID, then claim that tab again. If that fails, close the previous Kaggle session first, open a new Kaggle tab, and reopen the notebook/session.
- Keep notebooks focused and separate when topics diverge: LLM extraction, first model training, Optuna tuning, and different architectural approaches should each have their own notebook. Close the current Kaggle session before opening another notebook/session.
- Do not stop at a preliminary model. Continue the training/tuning loop until a strict, leakage-free test set reaches at least 80% accuracy, recording the split and metrics for every experiment.
- If Kaggle tab reconnection cannot be recovered using the exact Edge tab URL/provider-ID claim, close that stale tab manually. Also close older Kaggle tabs that are no longer being used so sessions and browser tabs do not accumulate overnight.
