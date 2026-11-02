#!/usr/bin/env python3
"""Convert reviewed release originals; never download or invent source/licence metadata.

python tools/prepare_sounds.py --sources /absolute/path/sources.json --output sounds
Requires ffmpeg, ffprobe and numpy. Originals stay outside the repository.
"""
import argparse
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlparse

import numpy as np

RATE = 44100
COUNTS = {"fire_pop": 4, "log_drop": 2, "step_wood": 4, "step_stone": 4,
          "step_grass": 4, "step_gravel": 4, "bird": 8, "owl": 2, "crow": 3}
LOOPS = {"fire_loop", "wind_soft_loop", "wind_gust_loop", "leaves_loop", "crickets_loop", "frogs_loop"}
IDS = LOOPS | {f"{group}_{i:02d}" for group, n in COUNTS.items() for i in range(1, n + 1)}
LICENSES = {"CC0-1.0", "Pixabay Content License", "Sonniss GDC EULA"}


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, check=False, **kwargs)
    if result.returncode:
        raise ValueError(result.stderr.decode(errors="replace")[-1800:])
    return result


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)]).stdout)


def detect_steps(path, count):
    # Walking takes often have clean silence between strikes. Ambiguous recordings
    # require explicit [start,end] segments instead of cutting a foot in half.
    text = run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-35dB:d=0.08", "-f", "null", "-"]).stderr.decode()
    cursor, spans = 0., []
    for key, number in re.findall(r"silence_(start|end): ([\d.]+)", text):
        t = float(number)
        if key == "start" and t - cursor >= .06:
            spans.append([max(0, cursor - .015), t + .025])
        elif key == "end":
            cursor = t
    end = duration(path)
    if end - cursor >= .06:
        spans.append([max(0, cursor - .015), end])
    spans = [s for s in spans if .06 <= s[1] - s[0] <= 1.2]
    if len(spans) < count:
        raise ValueError(f"{path.name}: {count}개 발소리를 분리하지 못했습니다. sources JSON에 segments를 직접 지정하세요.")
    return spans[:count]


def expand(sources):
    result, seen = [], set()
    for entry in sources:
        e = dict(entry)
        p = Path(e.get("path", "")).expanduser().resolve()
        if not p.is_file():
            raise ValueError(f"원본이 없습니다: {p}")
        if not e.get("author", "").strip() or e.get("license") not in LICENSES:
            raise ValueError("작성자와 파일별 라이선스(CC0-1.0 / Pixabay Content License / Sonniss GDC EULA)가 필요합니다.")
        url = urlparse(e.get("url", ""))
        if url.scheme != "https" or not url.netloc or any(v in e["url"] for v in ["AUTHOR", "EXACT-SOURCE", "/ID/"]):
            raise ValueError("예시가 아닌 실제 원본 페이지 HTTPS URL이 필요합니다.")
        identity = e.get("id")
        segments = e.get("segments")
        if identity in COUNTS:
            if segments is None and identity.startswith("step_"):
                segments = detect_steps(p, COUNTS[identity])
            if not segments or len(segments) > COUNTS[identity]:
                raise ValueError(f"{identity}: 변형별 segments가 필요합니다.")
            expanded = [dict(e, id=f"{identity}_{i:02d}", start=a, end=b) for i, (a, b) in enumerate(segments, 1)]
        else:
            expanded = [e]
        for clip in expanded:
            identity = clip["id"]
            if identity not in IDS or identity in seen:
                raise ValueError(f"알 수 없거나 중복된 소리 ID: {identity}")
            start = float(clip.get("start", 0))
            end = min(float(clip.get("end", duration(p))), start + (20.75 if identity in LOOPS else 8))
            if not math.isfinite(start + end) or start < 0 or end <= start:
                raise ValueError(f"잘못된 원본 구간: {identity}")
            clip.update(path=p, start=start, end=end)
            seen.add(identity)
            result.append(clip)
    return result


def loop_join(samples, overlap=.75):
    n = round(overlap * RATE)
    if len(samples) < n * 3:
        raise ValueError("루프 원본은 최소 3초 이상이어야 합니다.")
    f = np.linspace(0, 1, n, dtype=np.float32)
    # End of overlap continues into sample[n] at playback wrap. No duplicate seam.
    blend = samples[-n:] * (1 - f) + samples[:n] * f
    return np.concatenate([samples[n:-n], blend])


def normalize(samples, target):
    raw = samples.astype("<f4").tobytes()
    analysis = run(["ffmpeg", "-hide_banner", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
                    "-af", f"loudnorm=I={target}:TP=-3:LRA=11:print_format=json", "-f", "null", "-"], input=raw)
    report = json.loads(analysis.stderr.decode()[analysis.stderr.decode().rfind("{"):])
    measured = float(report["input_i"])
    rms = max(1e-9, float(np.sqrt(np.mean(samples ** 2))))
    if rms < 1e-7:
        raise ValueError("무음 파일은 소리로 등록할 수 없습니다.")
    mode = "LUFS" if math.isfinite(measured) else "RMS fallback (short transient)"
    delta = target - measured if math.isfinite(measured) else -21 - 20 * math.log10(rms)
    peak = max(1e-9, float(np.max(np.abs(samples))))
    gain = min(10 ** (delta / 20), 10 ** (-3 / 20) / peak)
    return (samples * gain).astype("<f4"), mode


def convert(clip, folder):
    identity = clip["id"]
    filters = "silenceremove=start_periods=1:start_duration=0.005:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0.005:start_threshold=-48dB,areverse"
    raw = run(["ffmpeg", "-v", "error", "-ss", str(clip["start"]), "-i", str(clip["path"]), "-t", str(clip["end"] - clip["start"]),
               "-vn", "-ac", "1", "-ar", str(RATE), "-af", filters, "-f", "f32le", "pipe:1"]).stdout
    samples = np.frombuffer(raw, dtype="<f4").copy()
    if len(samples) < RATE * .025:
        raise ValueError(f"{identity}: 유효한 소리가 너무 짧습니다.")
    if identity in LOOPS:
        samples = loop_join(samples)
    else:
        n = min(round(.005 * RATE), len(samples) // 4)
        samples[:n] *= np.linspace(0, 1, n)
        samples[-n:] *= np.linspace(1, 0, n)
    samples, mode = normalize(samples, -23 if identity in LOOPS else -18)
    for ext, codec in [("ogg", ["-c:a", "libopus", "-b:a", "64k", "-ar", "48000"]),
                       ("mp3", ["-c:a", "libmp3lame", "-b:a", "96k", "-ar", "44100"])]:
        run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", *codec, str(folder / (identity + "." + ext))], input=samples.tobytes())
    return {"duration": round(len(samples) / RATE, 5), "loop": identity in LOOPS,
            "ogg": f"./sounds/{identity}.ogg", "mp3": f"./sounds/{identity}.mp3", "normalization": mode}


def prepare(source_file, output):
    spec = json.loads(Path(source_file).read_text())
    clips = expand(spec["sources"])
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest_path, catalog_path = output / "manifest.json", output / "catalog.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"version": 1, "clips": {}}
    catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {}
    if not set(manifest["clips"]).issubset(catalog):
        raise ValueError("기존 manifest에 출처 catalog가 없는 항목이 있습니다. 기존 출처부터 복원하세요.")
    with tempfile.TemporaryDirectory(prefix=".prepare-sounds-", dir=output) as tmp:
        folder = Path(tmp)
        for clip in clips:
            manifest["clips"][clip["id"]] = convert(clip, folder)
            catalog[clip["id"]] = {k: clip[k] for k in ["url", "author", "license", "start", "end"]}
        names = {identity + "." + ext for identity in manifest["clips"] for ext in ["ogg", "mp3"]}
        total = sum(((folder / n) if (folder / n).exists() else output / n).stat().st_size for n in names)
        if total > 6_000_000:
            raise ValueError(f"변환 음성이 6MB를 초과합니다: {total} bytes. 루프/효과음 구간을 짧게 지정하세요.")
        for p in folder.iterdir():
            p.replace(output / p.name)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    esc = lambda s: str(s).replace("|", "\\|").replace("\n", " ")
    rows = ["# 자연의 소리 출처", "", "원본: GitHub sounds-src 릴리스. 저장소에는 변환본만 보관합니다.", "",
            "| 사용 파일 | 원본 URL | 작성자 | 라이선스 | 원본 구간 |", "|---|---|---|---|---|"]
    for identity, meta in sorted(catalog.items()):
        rows.append("| " + " | ".join(map(esc, [identity + ".ogg / .mp3", meta["url"], meta["author"], meta["license"], f'{meta["start"]}–{meta["end"]}s'])) + " |")
    (output / "CREDITS.md").write_text("\n".join(rows) + "\n")
    return {"clips": len(manifest["clips"]), "encodedBytes": total, "note": "PCM 44.1k mono; Opus encodes at its native 48k, MP3 at 44.1k. Audition before committing."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", required=True)
    parser.add_argument("--output", default="sounds")
    args = parser.parse_args()
    print(json.dumps(prepare(args.sources, args.output), ensure_ascii=False))
