"""
HTML Rapor - v2
fon_takip.py (fiyatlar) ve drift_rapor.py (hedef/gerçek hesabı) altyapısını
kullanarak tek sayfalık, etkileşimli bir rapor.html üretir:

- Özet kartları, dağılım donut'u, drift barları (hover ipuçlarıyla)
- Her fon için son GRAFIK_GUN günün mini fiyat grafiği ve dönem getirisi
- Tabloda elle değiştirilebilir adet/nakit; değerler tarayıcıda saklanır
  (localStorage) ve rapor yeniden üretilse de kaybolmaz
- ayarlar.MALIYETLER doluysa Kar/Zarar kolonları ve toplam K/Z kartı
- Her üretimde portfoy_gecmis.csv'ye günlük kayıt; sayfada zaman grafiği
- Son başarılı çekim veri_onbellek.json'a yazılır; ağ yokken onunla çalışır

Kullanım:
    python rapor_html.py            # TEFAS'tan güncel verilerle üretir
    python rapor_html.py --ac       # üretip tarayıcıda açar
    python rapor_html.py --onbellek # ağa çıkmadan son çekimin verisiyle üretir
"""

import argparse
import json
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

import pandas as pd

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from ayarlar import (DRIFT_ESIK, FONLAR, GRAFIK_GUN, HEDEFLER, MALIYETLER,
                     NAKIT_TL, PORTFOY)
from drift_rapor import degerleri_hesapla, drift_hesapla
from fon_takip import gunluk_getiri, ham_veri_cek, son_veri

KLASOR = Path(__file__).parent
CIKTI = KLASOR / "rapor.html"
ONBELLEK = KLASOR / "veri_onbellek.json"
GECMIS = KLASOR / "portfoy_gecmis.csv"


def fon_listesi() -> list[str]:
    """FONLAR + portföyde adedi olan fonlar (sıra korunur, tekrarsız)."""
    return list(dict.fromkeys(list(FONLAR) + [k for k, a in PORTFOY.items() if a > 0]))


def onbellege_yaz(ham: pd.DataFrame) -> None:
    kayit = {
        "cekim_zamani": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "kayitlar": ham.to_dict(orient="records"),
    }
    ONBELLEK.write_text(json.dumps(kayit, ensure_ascii=False), encoding="utf-8")


def onbellekten_oku() -> tuple[pd.DataFrame | None, str | None]:
    if not ONBELLEK.exists():
        return None, None
    try:
        kayit = json.loads(ONBELLEK.read_text(encoding="utf-8"))
        ham = pd.DataFrame(kayit["kayitlar"])
        if ham.empty:
            return None, None
        return ham, kayit.get("cekim_zamani")
    except (json.JSONDecodeError, KeyError):
        return None, None


def gecmis_guncelle(veri_tarihi: str, toplam: float, fon_tl: float,
                    nakit_tl: float) -> list[list]:
    """Bugünkü değerleri geçmiş dosyasına ekler (aynı tarih varsa günceller)."""
    satirlar: dict[str, list[str]] = {}
    if GECMIS.exists():
        for line in GECMIS.read_text(encoding="utf-8").splitlines()[1:]:
            parca = line.split(",")
            if len(parca) == 4:
                satirlar[parca[0]] = parca
    satirlar[veri_tarihi] = [veri_tarihi, f"{toplam:.2f}", f"{fon_tl:.2f}",
                             f"{nakit_tl:.2f}"]
    sirali = [satirlar[k] for k in sorted(satirlar)]
    GECMIS.write_text(
        "tarih,toplam_tl,fon_tl,nakit_tl\n"
        + "\n".join(",".join(s) for s in sirali) + "\n",
        encoding="utf-8",
    )
    return [[s[0], float(s[1]), float(s[2]), float(s[3])] for s in sirali]


def veri_topla(sadece_onbellek: bool = False) -> dict | None:
    uyari = None
    ham = None
    cekim_zamani = datetime.now().strftime("%Y-%m-%d %H:%M")

    if not sadece_onbellek:
        ham = ham_veri_cek(fonlar=fon_listesi(), gun_sayisi=GRAFIK_GUN)
        if ham is not None:
            ham = ham.copy()
            ham["date"] = ham["date"].astype(str)
            onbellege_yaz(ham)

    if ham is None:
        ham, eski_zaman = onbellekten_oku()
        if ham is None:
            return None
        cekim_zamani = eski_zaman or "bilinmiyor"
        if sadece_onbellek:
            uyari = f"Önbellek verisiyle üretildi (çekim: {cekim_zamani})."
        else:
            uyari = (f"TEFAS'a bağlanılamadı — {cekim_zamani} tarihli "
                     "önbellek verisi gösteriliyor.")

    ham = ham[ham["price"].notna() & (ham["price"] > 0)].copy()
    if ham.empty:
        return None
    ham["date"] = ham["date"].astype(str)

    data = son_veri(ham)
    getiriler = gunluk_getiri(ham)
    fiyatlar = dict(zip(data["code"], data["price"].astype(float)))
    basliklar = dict(zip(data["code"], data.get("title", data["code"])))
    veri_tarihi = str(data["date"].max())

    kategori = {}
    for _, satir in data.iterrows():
        rank, tot = satir.get("category_rank"), satir.get("category_total")
        if pd.notna(rank) and pd.notna(tot) and rank > 0:
            kategori[satir["code"]] = [int(rank), int(tot)]

    seriler = {}
    for kod, grup in ham.sort_values("date").groupby("code"):
        seriler[kod] = [[t, float(p)] for t, p in zip(grup["date"], grup["price"])]

    degerler = degerleri_hesapla(PORTFOY, fiyatlar, NAKIT_TL)
    _, toplam = drift_hesapla(degerler, HEDEFLER)
    fon_tl = sum(v for k, v in degerler.items() if k != "NAKIT")
    gecmis = gecmis_guncelle(veri_tarihi, toplam, fon_tl,
                             degerler.get("NAKIT", 0.0))

    return {
        "veriTarihi": veri_tarihi,
        "cekimZamani": cekim_zamani,
        "uretim": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "uyari": uyari,
        "grafikGun": GRAFIK_GUN,
        "esik": DRIFT_ESIK,
        "fonlar": [k for k in fon_listesi() if k in fiyatlar],
        "portfoy": {k: float(PORTFOY.get(k, 0)) for k in fon_listesi()},
        "nakit": float(NAKIT_TL),
        "fiyatlar": fiyatlar,
        "basliklar": basliklar,
        "kategori": kategori,
        "getiriler": {k: float(v) for k, v in getiriler.items()},
        "seriler": seriler,
        "hedefler": {g: {"fonlar": t["fonlar"], "hedef_yuzde": float(t["hedef_yuzde"])}
                     for g, t in HEDEFLER.items()},
        "maliyetler": {k: float(v) for k, v in MALIYETLER.items() if v > 0},
        "gecmis": gecmis,
    }


# --------------------------------------------------------------------------
# HTML iskeleti: __VERI_JSON__ ve __APP_JS__ üretim sırasında doldurulur.
# Tüm görünür içerik sayfadaki JS tarafından çizilir.
# --------------------------------------------------------------------------
HTML_SABLON = r"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TEFAS Fon Takip Raporu</title>
<style>
  .viz-root {
    color-scheme: light;
    --surface-1:      #fcfcfb;
    --page-plane:     #f9f9f7;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #898781;
    --gridline:       #e1e0d9;
    --border:         rgba(11,11,11,0.10);
    --good:           #006300;
    --critical-text:  #b23030;

    --series-1: #2a78d6;
    --series-2: #eb6834;
    --series-3: #1baf7a;
    --series-4: #eda100;
    --series-5: #e87ba4;
    --series-6: #008300;
    --series-7: #4a3aa7;
    --series-8: #e34948;

    --status-good:     #0ca30c;
    --status-warning:  #fab219;
    --status-critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1:      #1a1a19;
      --page-plane:     #0d0d0d;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #898781;
      --gridline:       #2c2c2a;
      --border:         rgba(255,255,255,0.10);
      --good:           #0ca30c;
      --critical-text:  #e66767;

      --series-1: #3987e5;
      --series-2: #d95926;
      --series-3: #199e70;
      --series-4: #c98500;
      --series-5: #d55181;
      --series-6: #008300;
      --series-7: #9085e9;
      --series-8: #e66767;
    }
  }
  :root[data-theme="dark"] .viz-root {
    color-scheme: dark;
    --surface-1:      #1a1a19;
    --page-plane:     #0d0d0d;
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #898781;
    --gridline:       #2c2c2a;
    --border:         rgba(255,255,255,0.10);
    --good:           #0ca30c;
    --critical-text:  #e66767;

    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --series-4: #c98500;
    --series-5: #d55181;
    --series-6: #008300;
    --series-7: #9085e9;
    --series-8: #e66767;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page-plane);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 32px 20px 64px;
  }
  .wrap { max-width: 1060px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); font-size: 0.9rem; margin: 0; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
  }
  .card h2 { font-size: 1rem; margin: 0 0 16px; color: var(--text-primary); }
  .hero-row { display: flex; gap: 20px; flex-wrap: wrap; }
  .stat-tile { flex: 1; min-width: 150px; }
  .stat-tile .label { font-size: 0.78rem; color: var(--text-muted); }
  .stat-tile .value {
    font-size: 1.6rem; font-weight: 600; margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }
  .donut-row { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
  .donut { width: 190px; height: 190px; flex-shrink: 0; position: relative; }
  .donut svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .donut-center {
    position: absolute; inset: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; text-align: center; pointer-events: none;
  }
  .donut-center .v { font-size: 1.02rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .donut-center .l { font-size: 0.68rem; color: var(--text-muted); }
  .legend { display: flex; flex-direction: column; gap: 9px; flex: 1; min-width: 220px; }
  .legend-item { display: flex; align-items: center; gap: 9px; font-size: 0.86rem; }
  .swatch { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
  .legend-item .name { color: var(--text-primary); }
  .legend-item .pct { margin-left: auto; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid var(--gridline); }
  th { color: var(--text-muted); font-weight: 500; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
  th.sirala { cursor: pointer; user-select: none; }
  th.sirala:hover { color: var(--text-primary); }
  th .ok { font-size: 0.62rem; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .delta-up { color: var(--good); }
  .delta-down { color: var(--critical-text); }
  .table-wrap { overflow-x: auto; }
  .alt-metin { font-size: 0.71rem; color: var(--text-muted); margin-top: 2px; font-weight: 400; text-transform: none; }
  .spark-hucre { width: 122px; }
  svg.spark { display: block; }
  .hint { color: var(--text-muted); font-size: 0.85rem; margin: 0; }

  .drift-group { margin-bottom: 20px; }
  .drift-group:last-child { margin-bottom: 0; }
  .drift-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .drift-head .name { font-weight: 600; font-size: 0.92rem; }
  .drift-head .status { font-size: 0.76rem; display: flex; align-items: center; gap: 5px; }
  .drift-head .status .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .bar-track {
    position: relative; height: 10px; background: var(--gridline);
    border-radius: 5px; overflow: visible;
  }
  .bar-fill { position: absolute; top: 0; left: 0; height: 100%; border-radius: 5px; }
  .bar-target-tick {
    position: absolute; top: -3px; width: 2px; height: 16px;
    background: var(--text-primary); border-radius: 1px;
  }
  .bar-meta { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-secondary); margin-top: 5px; font-variant-numeric: tabular-nums; }
  .action-line { font-size: 0.84rem; color: var(--text-primary); margin-top: 6px; }
  .action-line b { font-variant-numeric: tabular-nums; }

  .bar-legend { display: flex; gap: 18px; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 16px; flex-wrap: wrap; }
  .bar-legend .item { display: flex; align-items: center; gap: 6px; }
  .bar-legend .sw { width: 14px; height: 10px; border-radius: 2px; }

  .gecmis-svg { width: 100%; height: auto; display: block; }
  .eksen { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }

  .banner { display: flex; flex-direction: column; gap: 8px; }
  .banner-satir {
    background: var(--surface-1); border: 1px solid var(--border);
    border-left: 4px solid var(--series-1); border-radius: 8px;
    padding: 10px 14px; font-size: 0.86rem;
  }
  .banner-satir.uyari { border-left-color: var(--status-warning); }
  .btn-kucuk {
    margin-left: 6px; padding: 3px 10px; border-radius: 6px;
    border: 1px solid var(--border); background: var(--page-plane);
    color: var(--text-primary); font: inherit; font-size: 0.8rem; cursor: pointer;
  }
  .btn-kucuk:hover { border-color: var(--text-muted); }

  input[type="number"] {
    font: inherit; font-variant-numeric: tabular-nums; text-align: right;
    width: 88px; padding: 5px 7px; border-radius: 6px;
    border: 1px solid var(--border); background: var(--page-plane); color: var(--text-primary);
  }
  input[type="number"]:focus { outline: 2px solid var(--series-1); outline-offset: 1px; }
  .nakit-input { width: 100%; font-size: 1.15rem; font-weight: 600; margin-top: 4px; text-align: left; }
  code { background: var(--gridline); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
  .portfoy-cikti {
    width: 100%; font: 0.82rem/1.4 ui-monospace, monospace; color: var(--text-primary);
    background: var(--page-plane); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; resize: vertical; box-sizing: border-box;
  }
  .btn {
    margin-top: 10px; padding: 8px 16px; border-radius: 8px; border: none;
    background: var(--series-1); color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  .btn:hover { opacity: 0.9; }
  .kopyala-durum { margin-left: 10px; font-size: 0.82rem; color: var(--good); }

  .tooltip {
    position: fixed; z-index: 50; pointer-events: none;
    background: var(--surface-1); color: var(--text-primary);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 7px 10px; font-size: 0.78rem; line-height: 1.45;
    box-shadow: 0 4px 14px rgba(0,0,0,0.13);
    font-variant-numeric: tabular-nums; max-width: 300px;
  }

  footer { text-align: center; color: var(--text-muted); font-size: 0.75rem; margin-top: 8px; }
</style>
</head>
<body>
<div class="viz-root">
  <div class="wrap">
    <div>
      <h1>TEFAS Fon Takip Raporu</h1>
      <p class="subtitle" id="alt-baslik"></p>
    </div>

    <div id="banner" class="banner" hidden></div>

    <div class="card">
      <h2>Portföy Özeti</h2>
      <div class="hero-row">
        <div class="stat-tile">
          <div class="label">Toplam Değer</div>
          <div class="value" id="stat-toplam"></div>
        </div>
        <div class="stat-tile">
          <div class="label">Fon Varlıkları</div>
          <div class="value" id="stat-fon-toplam"></div>
        </div>
        <div class="stat-tile">
          <div class="label">Nakit (TL, elle girilebilir)</div>
          <input type="number" class="nakit-input" id="nakit-input" min="0" step="any" oninput="onNakitDegisti(this)">
        </div>
        <div class="stat-tile" id="kz-tile" hidden>
          <div class="label">Toplam Kar/Zarar</div>
          <div class="value" id="stat-kz"></div>
        </div>
        <div class="stat-tile">
          <div class="label">Eşik Aşan Grup</div>
          <div class="value" id="stat-esik-asan"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Dağılım</h2>
      <div class="donut-row">
        <div class="donut">
          <svg id="donut-svg" viewBox="0 0 190 190" role="img" aria-label="Portföy dağılımı"></svg>
          <div class="donut-center">
            <div class="v" id="donut-toplam"></div>
            <div class="l">toplam</div>
          </div>
        </div>
        <div class="legend" id="legend"></div>
      </div>
    </div>

    <div class="card">
      <h2 id="drift-baslik">Drift Raporu — Hedef vs. Gerçek</h2>
      <div class="bar-legend">
        <span class="item"><span class="sw" style="background:var(--text-primary)"></span>Hedef (dikey çizgi)</span>
        <span class="item"><span class="sw" style="background:var(--status-critical)"></span>Gerçek — eşik aşıldı</span>
        <span class="item"><span class="sw" style="background:var(--status-good)"></span>Gerçek — eşik içinde</span>
      </div>
      <div id="drift-container"></div>
    </div>

    <div class="card">
      <h2>Portföy Değeri Geçmişi</h2>
      <div class="bar-legend" id="gecmis-legend"></div>
      <div id="gecmis-alan"></div>
    </div>

    <div class="card">
      <h2>Fon Detayları</h2>
      <div class="table-wrap">
        <table>
          <thead id="tablo-bas"></thead>
          <tbody id="tablo-govde"></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Kalıcı Kaydet</h2>
      <p class="subtitle" style="margin-bottom:12px;">
        Sayfada girdiğin adet ve nakit değerleri bu tarayıcıda otomatik saklanır
        ve rapor yeniden üretilse de korunur. Değerleri
        <code>ayarlar.py</code>'ye de işlemek istersen aşağıdaki metni kopyalayıp
        dosyadaki <code>PORTFOY</code> ve <code>NAKIT_TL</code> tanımlarının
        yerine yapıştır — böylece drift_rapor.py gibi diğer betikler de aynı
        değerleri kullanır.
      </p>
      <textarea id="portfoy-cikti" class="portfoy-cikti" readonly rows="12"></textarea>
      <button type="button" class="btn" onclick="kopyala()">Panoya kopyala</button>
      <span id="kopyala-durum" class="kopyala-durum"></span>
    </div>

    <footer id="alt-bilgi">rapor_html.py ile oluşturuldu · sadece yerel dosya, hiçbir yere gönderilmedi</footer>
  </div>
</div>

<div id="tooltip" class="tooltip" hidden></div>

<script id="veri-json" type="application/json">__VERI_JSON__</script>
<script>
__APP_JS__
</script>
</body>
</html>
"""

APP_JS = r"""'use strict';
const VERI = JSON.parse(document.getElementById('veri-json').textContent);
const SERIES = ['--series-1','--series-2','--series-3','--series-4','--series-5','--series-6','--series-7','--series-8'];
const DONUT_ESIK = 3.0;
const LS_KEY = 'tefasRaporDegerler';
const maliyetVar = Object.keys(VERI.maliyetler || {}).length > 0;
let sonDilimler = [];
let sirala = { id: 'deger', yon: -1 };

// ---- yardımcılar ---------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function sayiTr(v, ond) {
  if (ond === undefined) ond = 2;
  return v.toLocaleString('tr-TR', { minimumFractionDigits: ond, maximumFractionDigits: ond });
}
function tlStr(v) { return sayiTr(v) + ' TL'; }
function tarihTr(iso) { const p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
function yuzdeHucre(v, ond) {
  if (v === null || v === undefined) return '<td class="num">n/a</td>';
  const sinif = v >= 0 ? 'delta-up' : 'delta-down';
  return '<td class="num ' + sinif + '">' + (v >= 0 ? '+' : '') + sayiTr(v, ond === undefined ? 2 : ond) + '%</td>';
}

// ---- durum + localStorage ------------------------------------------------
const varsayilan = { adetler: Object.assign({}, VERI.portfoy), nakit: VERI.nakit };
let state = { adetler: Object.assign({}, VERI.portfoy), nakit: VERI.nakit };
let lsYuklendi = false;
try {
  const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (s && s.adetler) {
    for (const kod of Object.keys(state.adetler)) {
      if (typeof s.adetler[kod] === 'number' && isFinite(s.adetler[kod]) && s.adetler[kod] >= 0)
        state.adetler[kod] = s.adetler[kod];
    }
    if (typeof s.nakit === 'number' && isFinite(s.nakit) && s.nakit >= 0) state.nakit = s.nakit;
    lsYuklendi = farkliMi();
  }
} catch (e) {}

function farkliMi() {
  if (Math.abs(state.nakit - varsayilan.nakit) > 1e-9) return true;
  return Object.keys(varsayilan.adetler).some(k => Math.abs((state.adetler[k] || 0) - varsayilan.adetler[k]) > 1e-9);
}
function lsKaydet() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function lsSifirla() {
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
  state = { adetler: Object.assign({}, varsayilan.adetler), nakit: varsayilan.nakit };
  lsYuklendi = false;
  document.getElementById('nakit-input').value = state.nakit;
  bannerKur(); tabloKur(); tumunuGuncelle();
}

// ---- hesap ---------------------------------------------------------------
function hesapla() {
  const degerler = {};
  for (const kod of VERI.fonlar) {
    const adet = state.adetler[kod] || 0;
    const fiyat = VERI.fiyatlar[kod];
    if (adet > 0 && fiyat) degerler[kod] = adet * fiyat;
  }
  if (state.nakit > 0) degerler.NAKIT = state.nakit;
  const toplam = Object.values(degerler).reduce((a, b) => a + b, 0);

  const drift = [];
  const atanan = new Set();
  for (const grup of Object.keys(VERI.hedefler)) {
    const tanim = VERI.hedefler[grup];
    tanim.fonlar.forEach(k => atanan.add(k));
    const tl = tanim.fonlar.reduce((a, k) => a + (degerler[k] || 0), 0);
    const gercek = toplam > 0 ? 100 * tl / toplam : 0;
    const sapma = gercek - tanim.hedef_yuzde;
    drift.push({
      grup, hedef: tanim.hedef_yuzde, gercek, sapma,
      duzeltme: (tanim.hedef_yuzde - gercek) / 100 * toplam,
      asildi: Math.abs(sapma) > VERI.esik,
    });
  }
  const disarida = Object.entries(degerler).filter(p => !atanan.has(p[0]));
  if (disarida.length) {
    const tl = disarida.reduce((a, p) => a + p[1], 0);
    const gercek = toplam > 0 ? 100 * tl / toplam : 0;
    drift.push({
      grup: '(hedefsiz: ' + disarida.map(p => p[0]).join(', ') + ')',
      hedef: 0, gercek, sapma: gercek, duzeltme: -tl, asildi: gercek > VERI.esik,
    });
  }

  const kalemler = Object.entries(degerler).filter(p => p[1] > 0).map(p => {
    const kod = p[0], deger = p[1];
    const pay = 100 * deger / toplam;
    const ad = kod === 'NAKIT' ? 'Nakit' : kod + ' — ' + (VERI.basliklar[kod] || kod);
    return { kod, ad, pay, deger };
  }).sort((a, b) => b.pay - a.pay);
  const buyukler = kalemler.filter(k => k.pay >= DONUT_ESIK);
  const kucukler = kalemler.filter(k => k.pay < DONUT_ESIK);
  const dilimler = buyukler.length > SERIES.length ? buyukler.slice(0, SERIES.length - 1) : buyukler.slice();
  const digerKalemler = kucukler.concat(buyukler.slice(dilimler.length));
  const digerPay = digerKalemler.reduce((a, k) => a + k.pay, 0);
  if (digerPay > 0) {
    dilimler.push({
      kod: 'DIGER', ad: 'Diğer (' + digerKalemler.map(k => k.kod).join(', ') + ')',
      pay: digerPay, deger: digerKalemler.reduce((a, k) => a + k.deger, 0),
    });
  }

  const kz = {};
  let kzToplam = 0, kzMaliyetTabani = 0;
  for (const kod of Object.keys(VERI.maliyetler || {})) {
    const maliyet = VERI.maliyetler[kod];
    const adet = state.adetler[kod] || 0;
    const fiyat = VERI.fiyatlar[kod];
    if (adet > 0 && fiyat && maliyet > 0) {
      kz[kod] = { tl: (fiyat - maliyet) * adet, yuzde: (fiyat / maliyet - 1) * 100 };
      kzToplam += kz[kod].tl;
      kzMaliyetTabani += maliyet * adet;
    }
  }
  return { degerler, toplam, drift, dilimler, kz, kzToplam, kzMaliyetTabani };
}

function satirVerileri(h) {
  return VERI.fonlar.map(kod => {
    const seri = VERI.seriler[kod] || [];
    const donem = (seri.length >= 2 && seri[0][1] > 0)
      ? (seri[seri.length - 1][1] / seri[0][1] - 1) * 100 : null;
    return {
      kod,
      ad: VERI.basliklar[kod] || kod,
      fiyat: VERI.fiyatlar[kod] || null,
      gunluk: (kod in VERI.getiriler) ? VERI.getiriler[kod] : null,
      donem,
      adet: state.adetler[kod] || 0,
      kzTl: h.kz[kod] ? h.kz[kod].tl : null,
      kzYuzde: h.kz[kod] ? h.kz[kod].yuzde : null,
      deger: h.degerler[kod] || 0,
      pay: h.toplam > 0 ? 100 * (h.degerler[kod] || 0) / h.toplam : 0,
    };
  });
}

// ---- tooltip -------------------------------------------------------------
const tooltipEl = document.getElementById('tooltip');
function tooltipGoster(html, ev) {
  tooltipEl.innerHTML = html;
  tooltipEl.hidden = false;
  const x = Math.min(ev.clientX + 14, window.innerWidth - tooltipEl.offsetWidth - 10);
  const y = Math.min(ev.clientY + 14, window.innerHeight - tooltipEl.offsetHeight - 10);
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}
function tooltipGizle() { tooltipEl.hidden = true; }

// ---- banner --------------------------------------------------------------
function bannerKur() {
  const b = document.getElementById('banner');
  const parcalar = [];
  if (VERI.uyari) parcalar.push('<div class="banner-satir uyari">⚠ ' + esc(VERI.uyari) + '</div>');
  if (lsYuklendi) parcalar.push(
    "<div class=\"banner-satir\">Bu sayfada daha önce kaydettiğin adet/nakit değerleri yüklendi (ayarlar.py'den farklı)." +
    ' <button type="button" class="btn-kucuk" onclick="lsSifirla()">ayarlar.py değerlerine dön</button></div>');
  b.innerHTML = parcalar.join('');
  b.hidden = parcalar.length === 0;
}

// ---- donut ---------------------------------------------------------------
function arcYolu(cx, cy, r1, r2, a0, a1) {
  const buyuk = (a1 - a0) > Math.PI ? 1 : 0;
  const p = (r, a) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
  return 'M' + p(r2, a0) + ' A' + r2 + ' ' + r2 + ' 0 ' + buyuk + ' 1 ' + p(r2, a1) +
         ' L' + p(r1, a1) + ' A' + r1 + ' ' + r1 + ' 0 ' + buyuk + ' 0 ' + p(r1, a0) + ' Z';
}
function donutCiz(dilimler, toplam) {
  const svg = document.getElementById('donut-svg');
  if (toplam <= 0 || !dilimler.length) {
    svg.innerHTML = '<circle cx="95" cy="95" r="77" fill="none" stroke="var(--gridline)" stroke-width="34"/>';
    return;
  }
  let a = -Math.PI / 2;
  let out = '';
  dilimler.forEach((d, i) => {
    let ang = 2 * Math.PI * d.pay / 100;
    if (ang >= 2 * Math.PI - 1e-4) ang = 2 * Math.PI - 1e-3;
    out += '<path d="' + arcYolu(95, 95, 60, 94, a, a + ang) + '" fill="var(' + SERIES[i] + ')"' +
           ' stroke="var(--surface-1)" stroke-width="2" data-i="' + i + '"></path>';
    a += ang;
  });
  svg.innerHTML = out;
  svg.querySelectorAll('path').forEach(p => {
    p.addEventListener('mousemove', ev => {
      const d = sonDilimler[+p.dataset.i];
      if (d) tooltipGoster('<b>' + esc(d.ad) + '</b><br>' + sayiTr(d.pay) + '% · ' + tlStr(d.deger), ev);
    });
    p.addEventListener('mouseleave', tooltipGizle);
  });
}
function legendCiz(dilimler) {
  document.getElementById('legend').innerHTML = dilimler.map((d, i) =>
    '<div class="legend-item"><span class="swatch" style="background:var(' + SERIES[i] + ')"></span>' +
    '<span class="name">' + esc(d.ad) + '</span><span class="pct">' + sayiTr(d.pay) + '%</span></div>'
  ).join('');
}

// ---- drift ---------------------------------------------------------------
function driftCiz(drift) {
  document.getElementById('drift-container').innerHTML = drift.map(s => {
    const renk = s.asildi ? 'var(--status-critical)' : 'var(--status-good)';
    const genislik = Math.max(0, Math.min(100, s.gercek));
    let aksiyon = '';
    if (s.asildi) {
      const yon = s.duzeltme > 0 ? 'al' : 'sat';
      aksiyon = '<div class="action-line">Önerilen aksiyon: <b>' + tlStr(Math.abs(s.duzeltme)) + ' ' + yon + '</b></div>';
    }
    return '<div class="drift-group">' +
      '<div class="drift-head"><span class="name">' + esc(s.grup) + '</span>' +
      '<span class="status" style="color:' + renk + '"><span class="dot" style="background:' + renk + '"></span>Sapma ' +
      (s.sapma >= 0 ? '+' : '') + s.sapma.toFixed(1) + ' puan</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + genislik.toFixed(2) + '%; background:' + renk + ';"></div>' +
      '<div class="bar-target-tick" style="left:' + s.hedef.toFixed(2) + '%;"></div></div>' +
      '<div class="bar-meta"><span>Gerçek: ' + sayiTr(s.gercek, 1) + '%</span><span>Hedef: ' + sayiTr(s.hedef, 1) + '%</span></div>' +
      aksiyon + '</div>';
  }).join('');
}

// ---- geçmiş grafiği ------------------------------------------------------
function gecmisCiz() {
  const alan = document.getElementById('gecmis-alan');
  const lg = document.getElementById('gecmis-legend');
  const g = VERI.gecmis || [];
  if (g.length < 2) {
    lg.innerHTML = '';
    alan.innerHTML = '<p class="hint">' + (g.length === 1
      ? 'Şimdilik tek kayıt var (' + tarihTr(g[0][0]) + ' — ' + tlStr(g[0][1]) + '). Raporu farklı günlerde üretmeye devam ettikçe burada portföy değerinin zaman grafiği oluşacak.'
      : 'Henüz geçmiş kaydı yok.') + '</p>';
    return;
  }
  const W = 720, H = 210, L = 84, R = 14, T = 12, B = 30;
  const t0 = Date.parse(g[0][0]), t1 = Date.parse(g[g.length - 1][0]);
  const seriler = [
    { ad: 'Toplam', i: 0, v: r => r[1] },
    { ad: 'Fon', i: 1, v: r => r[2] },
    { ad: 'Nakit', i: 2, v: r => r[3] },
  ];
  const hepsi = [];
  for (const r of g) { hepsi.push(r[1], r[2], r[3]); }
  let min = Math.min.apply(null, hepsi), max = Math.max.apply(null, hepsi);
  const pad = (max - min) * 0.08 || max * 0.05 || 1;
  min = Math.max(0, min - pad); max += pad;
  const X = t => L + (W - L - R) * ((t - t0) / ((t1 - t0) || 1));
  const Y = v => T + (H - T - B) * (1 - (v - min) / ((max - min) || 1));
  let out = '';
  for (let i = 0; i < 4; i++) {
    const v = min + (max - min) * i / 3, y = Y(v);
    out += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="var(--gridline)" stroke-width="1"/>';
    out += '<text x="' + (L - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" class="eksen">' + sayiTr(v, 0) + '</text>';
  }
  const xEtiket = [{ r: g[0], a: 'start' }, { r: g[g.length - 1], a: 'end' }];
  if (g.length > 2) xEtiket.splice(1, 0, { r: g[Math.floor(g.length / 2)], a: 'middle' });
  for (const e of xEtiket) {
    out += '<text x="' + X(Date.parse(e.r[0])).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + e.a + '" class="eksen">' + tarihTr(e.r[0]) + '</text>';
  }
  for (const s of seriler) {
    out += '<polyline fill="none" stroke="var(--series-' + (s.i + 1) + ')" stroke-width="2" stroke-linejoin="round" points="' +
      g.map(r => X(Date.parse(r[0])).toFixed(1) + ',' + Y(s.v(r)).toFixed(1)).join(' ') + '"/>';
    if (g.length <= 25) {
      for (const r of g) {
        out += '<circle cx="' + X(Date.parse(r[0])).toFixed(1) + '" cy="' + Y(s.v(r)).toFixed(1) + '" r="3.2" fill="var(--series-' + (s.i + 1) + ')" stroke="var(--surface-1)" stroke-width="2"/>';
      }
    }
  }
  out += '<line id="gecmis-im" y1="' + T + '" y2="' + (H - B) + '" x1="0" x2="0" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>';
  out += '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent" id="gecmis-yakala"/>';
  alan.innerHTML = '<svg class="gecmis-svg" viewBox="0 0 ' + W + ' ' + H + '">' + out + '</svg>';
  lg.innerHTML = seriler.map(s =>
    '<span class="item"><span class="sw" style="background:var(--series-' + (s.i + 1) + ')"></span>' + s.ad + '</span>').join('');
  const svg = alan.querySelector('svg');
  const im = svg.querySelector('#gecmis-im');
  svg.querySelector('#gecmis-yakala').addEventListener('mousemove', ev => {
    const rct = svg.getBoundingClientRect();
    const x = (ev.clientX - rct.left) * W / rct.width;
    let enYakin = g[0], enKucuk = Infinity;
    for (const r of g) {
      const d = Math.abs(X(Date.parse(r[0])) - x);
      if (d < enKucuk) { enKucuk = d; enYakin = r; }
    }
    const px = X(Date.parse(enYakin[0])).toFixed(1);
    im.setAttribute('x1', px); im.setAttribute('x2', px); im.setAttribute('opacity', '1');
    tooltipGoster('<b>' + tarihTr(enYakin[0]) + '</b><br>Toplam: ' + tlStr(enYakin[1]) +
      '<br>Fon: ' + tlStr(enYakin[2]) + '<br>Nakit: ' + tlStr(enYakin[3]), ev);
  });
  svg.querySelector('#gecmis-yakala').addEventListener('mouseleave', () => {
    im.setAttribute('opacity', '0'); tooltipGizle();
  });
}

// ---- mini fiyat grafikleri ----------------------------------------------
const sparkGeo = {};
function sparkSvg(kod) {
  const seri = VERI.seriler[kod] || [];
  if (seri.length < 2) return '<span class="alt-metin">veri yok</span>';
  const W = 110, H = 34, P = 3;
  const fiyatlar = seri.map(s => s[1]);
  const min = Math.min.apply(null, fiyatlar), max = Math.max.apply(null, fiyatlar);
  const aralik = (max - min) || 1;
  const t0 = Date.parse(seri[0][0]);
  const t1 = Date.parse(seri[seri.length - 1][0]);
  const pts = seri.map(s => ({
    x: P + (W - 2 * P) * ((Date.parse(s[0]) - t0) / ((t1 - t0) || 1)),
    y: H - P - (H - 2 * P) * ((s[1] - min) / aralik),
    t: s[0], p: s[1],
  }));
  sparkGeo[kod] = { pts, W };
  return '<svg class="spark" data-kod="' + kod + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<polyline fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' +
    pts.map(pt => pt.x.toFixed(1) + ',' + pt.y.toFixed(1)).join(' ') + '"/>' +
    '<circle class="spark-dot" r="3" fill="var(--series-1)" opacity="0" cx="0" cy="0"/></svg>';
}
function sparkOlaylariBagla() {
  document.querySelectorAll('svg.spark').forEach(svg => {
    const g = sparkGeo[svg.dataset.kod];
    if (!g) return;
    const dot = svg.querySelector('.spark-dot');
    svg.addEventListener('mousemove', ev => {
      const r = svg.getBoundingClientRect();
      const x = (ev.clientX - r.left) * g.W / r.width;
      let enYakin = g.pts[0];
      for (const pt of g.pts) if (Math.abs(pt.x - x) < Math.abs(enYakin.x - x)) enYakin = pt;
      dot.setAttribute('cx', enYakin.x.toFixed(1));
      dot.setAttribute('cy', enYakin.y.toFixed(1));
      dot.setAttribute('opacity', '1');
      tooltipGoster(tarihTr(enYakin.t) + '<br><b>' + sayiTr(enYakin.p, enYakin.p < 10 ? 6 : 2) + '</b>', ev);
    });
    svg.addEventListener('mouseleave', () => { dot.setAttribute('opacity', '0'); tooltipGizle(); });
  });
}

// ---- tablo ---------------------------------------------------------------
function sutunlar() {
  const s = [
    { id: 'kod', ad: 'Kod', num: false },
    { id: 'ad', ad: 'Ad', num: false },
    { id: 'fiyat', ad: 'Fiyat', num: true },
    { id: 'gunluk', ad: 'Günlük', num: true },
    { id: 'grafik', ad: VERI.grafikGun + ' Gün', sirasiz: true },
    { id: 'donem', ad: VERI.grafikGun + 'G Getiri', num: true },
    { id: 'adet', ad: 'Adet', num: true },
  ];
  if (maliyetVar) {
    s.push({ id: 'kzTl', ad: 'K/Z (TL)', num: true });
    s.push({ id: 'kzYuzde', ad: 'K/Z %', num: true });
  }
  s.push({ id: 'deger', ad: 'Değer (TL)', num: true });
  s.push({ id: 'pay', ad: 'Pay %', num: true });
  return s;
}
function siralaDegistir(id) {
  const kolon = sutunlar().find(s => s.id === id);
  if (!kolon || kolon.sirasiz) return;
  if (sirala.id === id) sirala.yon = -sirala.yon;
  else sirala = { id, yon: kolon.num ? -1 : 1 };
  tabloKur(); tumunuGuncelle();
}
function tabloKur() {
  const h = hesapla();
  const kolonlar = sutunlar();
  document.getElementById('tablo-bas').innerHTML = '<tr>' + kolonlar.map(k => {
    const ok = sirala.id === k.id ? ' <span class="ok">' + (sirala.yon > 0 ? '▲' : '▼') + '</span>' : '';
    const sinif = (k.num ? 'num ' : '') + (k.sirasiz ? '' : 'sirala');
    const tik = k.sirasiz ? '' : ' onclick="siralaDegistir(\'' + k.id + '\')"';
    return '<th class="' + sinif.trim() + '"' + tik + '>' + esc(k.ad) + ok + '</th>';
  }).join('') + '</tr>';

  const satirlar = satirVerileri(h);
  satirlar.sort((a, b) => {
    const av = a[sirala.id], bv = b[sirala.id];
    if (typeof av === 'string' || typeof bv === 'string')
      return sirala.yon * String(av).localeCompare(String(bv), 'tr');
    const an = (av === null || av === undefined) ? -Infinity : av;
    const bn = (bv === null || bv === undefined) ? -Infinity : bv;
    return sirala.yon * (an - bn);
  });

  const govde = [];
  for (const r of satirlar) {
    const kat = VERI.kategori[r.kod];
    const katMetin = kat ? '<div class="alt-metin">Kategori sırası: ' + kat[0] + ' / ' + kat[1] + '</div>' : '';
    let kzHucreler = '';
    if (maliyetVar) {
      if (r.kzTl === null) {
        kzHucreler = '<td class="num" id="kz-' + r.kod + '">—</td><td class="num" id="kzp-' + r.kod + '">—</td>';
      } else {
        const sinif = r.kzTl >= 0 ? 'delta-up' : 'delta-down';
        kzHucreler = '<td class="num ' + sinif + '" id="kz-' + r.kod + '">' + sayiTr(r.kzTl) + '</td>' +
          '<td class="num ' + sinif + '" id="kzp-' + r.kod + '">' + (r.kzYuzde >= 0 ? '+' : '') + sayiTr(r.kzYuzde) + '%</td>';
      }
    }
    govde.push('<tr>' +
      '<td>' + esc(r.kod) + '</td>' +
      '<td>' + esc(r.ad) + katMetin + '</td>' +
      '<td class="num">' + (r.fiyat !== null ? sayiTr(r.fiyat, 6) : 'n/a') + '</td>' +
      yuzdeHucre(r.gunluk) +
      '<td class="spark-hucre">' + sparkSvg(r.kod) + '</td>' +
      yuzdeHucre(r.donem) +
      '<td class="num"><input type="number" min="0" step="any" value="' + r.adet + '" id="adet-' + r.kod + '"' +
      ' oninput="onAdetDegisti(\'' + r.kod + '\', this)"></td>' +
      kzHucreler +
      '<td class="num" id="deger-' + r.kod + '">' + sayiTr(r.deger) + '</td>' +
      '<td class="num" id="pay-' + r.kod + '">' + sayiTr(r.pay) + '%</td>' +
      '</tr>');
  }
  const nakitPay = h.toplam > 0 ? 100 * (h.degerler.NAKIT || 0) / h.toplam : 0;
  govde.push('<tr>' +
    '<td>—</td><td><b>Nakit</b></td><td class="num">—</td><td class="num">—</td>' +
    '<td></td><td class="num">—</td><td class="num">—</td>' +
    (maliyetVar ? '<td class="num">—</td><td class="num">—</td>' : '') +
    '<td class="num" id="deger-NAKIT">' + sayiTr(h.degerler.NAKIT || 0) + '</td>' +
    '<td class="num" id="pay-NAKIT">' + sayiTr(nakitPay) + '%</td></tr>');
  document.getElementById('tablo-govde').innerHTML = govde.join('');
  sparkOlaylariBagla();
}

// ---- genel güncelleme ----------------------------------------------------
function tumunuGuncelle() {
  const h = hesapla();
  sonDilimler = h.dilimler;

  const fonToplam = Object.entries(h.degerler).filter(p => p[0] !== 'NAKIT').reduce((a, p) => a + p[1], 0);
  document.getElementById('stat-toplam').textContent = tlStr(h.toplam);
  document.getElementById('stat-fon-toplam').textContent = tlStr(fonToplam);
  document.getElementById('donut-toplam').textContent = sayiTr(h.toplam, 0) + ' TL';
  document.getElementById('alt-baslik').textContent =
    'Veri tarihi: ' + tarihTr(VERI.veriTarihi) + ' · Portföy toplamı: ' + tlStr(h.toplam) +
    ' · Üretim: ' + VERI.uretim;
  document.getElementById('drift-baslik').textContent =
    'Drift Raporu — Hedef vs. Gerçek (eşik ±' + VERI.esik + ' puan)';

  const esikAsan = h.drift.filter(s => s.asildi).length;
  const esikEl = document.getElementById('stat-esik-asan');
  esikEl.textContent = esikAsan + ' / ' + h.drift.length;
  esikEl.style.color = esikAsan > 0 ? 'var(--status-critical)' : 'var(--status-good)';

  if (maliyetVar) {
    const tile = document.getElementById('kz-tile');
    tile.hidden = false;
    const el = document.getElementById('stat-kz');
    el.textContent = (h.kzToplam >= 0 ? '+' : '') + tlStr(h.kzToplam);
    el.style.color = h.kzToplam >= 0 ? 'var(--good)' : 'var(--critical-text)';
  }

  donutCiz(h.dilimler, h.toplam);
  legendCiz(h.dilimler);
  driftCiz(h.drift);

  for (const r of satirVerileri(h)) {
    const degerEl = document.getElementById('deger-' + r.kod);
    if (!degerEl) continue;
    degerEl.textContent = sayiTr(r.deger);
    document.getElementById('pay-' + r.kod).textContent = sayiTr(r.pay) + '%';
    if (maliyetVar) {
      const kzEl = document.getElementById('kz-' + r.kod);
      const kzpEl = document.getElementById('kzp-' + r.kod);
      if (kzEl && kzpEl) {
        if (r.kzTl === null) { kzEl.textContent = '—'; kzpEl.textContent = '—'; kzEl.className = 'num'; kzpEl.className = 'num'; }
        else {
          const sinif = 'num ' + (r.kzTl >= 0 ? 'delta-up' : 'delta-down');
          kzEl.textContent = sayiTr(r.kzTl); kzEl.className = sinif;
          kzpEl.textContent = (r.kzYuzde >= 0 ? '+' : '') + sayiTr(r.kzYuzde) + '%'; kzpEl.className = sinif;
        }
      }
    }
  }
  const nakitEl = document.getElementById('deger-NAKIT');
  if (nakitEl) {
    nakitEl.textContent = sayiTr(h.degerler.NAKIT || 0);
    document.getElementById('pay-NAKIT').textContent =
      sayiTr(h.toplam > 0 ? 100 * (h.degerler.NAKIT || 0) / h.toplam : 0) + '%';
  }

  kaliciMetinGuncelle();
}

function kaliciMetinGuncelle() {
  const satirlar = VERI.fonlar.map(kod => '    "' + kod + '": ' + (state.adetler[kod] || 0) + ',');
  document.getElementById('portfoy-cikti').value =
    'PORTFOY = {\n' + satirlar.join('\n') + '\n}\n\nNAKIT_TL = ' + state.nakit + '\n';
}

function onAdetDegisti(kod, el) {
  const v = parseFloat(el.value);
  state.adetler[kod] = (isFinite(v) && v >= 0) ? v : 0;
  lsKaydet();
  tumunuGuncelle();
}
function onNakitDegisti(el) {
  const v = parseFloat(el.value);
  state.nakit = (isFinite(v) && v >= 0) ? v : 0;
  lsKaydet();
  tumunuGuncelle();
}

function kopyala() {
  const el = document.getElementById('portfoy-cikti');
  const durum = document.getElementById('kopyala-durum');
  const bitti = () => { durum.textContent = 'Kopyalandı'; setTimeout(() => { durum.textContent = ''; }, 2000); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(el.value).then(bitti).catch(() => { el.select(); document.execCommand('copy'); bitti(); });
  } else { el.select(); document.execCommand('copy'); bitti(); }
}

// ---- başlat --------------------------------------------------------------
document.getElementById('nakit-input').value = state.nakit;
document.getElementById('alt-bilgi').textContent =
  'rapor_html.py ile oluşturuldu (veri çekimi: ' + VERI.cekimZamani + ') · sadece yerel dosya, hiçbir yere gönderilmedi';
bannerKur();
gecmisCiz();
tabloKur();
tumunuGuncelle();
"""


def rapor_uret(veri: dict) -> str:
    veri_json = json.dumps(veri, ensure_ascii=False).replace("</", "<\\/")
    return HTML_SABLON.replace("__VERI_JSON__", veri_json).replace("__APP_JS__", APP_JS)


def main() -> None:
    p = argparse.ArgumentParser(
        description="fon_takip + drift_rapor verilerinden etkileşimli rapor.html üretir")
    p.add_argument("--ac", action="store_true", help="Üretimden sonra tarayıcıda aç")
    p.add_argument("--onbellek", action="store_true",
                   help="TEFAS'a bağlanmadan son başarılı çekimin verisiyle üret")
    args = p.parse_args()

    veri = veri_topla(sadece_onbellek=args.onbellek)
    if veri is None:
        print("Veri yok: TEFAS'a ulaşılamadı ve kullanılabilir önbellek bulunamadı.\n"
              "İnternet bağlantısını kontrol edip tekrar dene.")
        sys.exit(1)

    CIKTI.write_text(rapor_uret(veri), encoding="utf-8")
    print(f"Rapor oluşturuldu: {CIKTI}")
    if veri["uyari"]:
        print(f"[!] {veri['uyari']}")

    if args.ac:
        webbrowser.open(CIKTI.as_uri())


if __name__ == "__main__":
    main()
