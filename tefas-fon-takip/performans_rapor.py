"""
Performans Raporu - v5
TEFAS'ın nitelikli-yatırımcı-dışı ve büyüklüğü ayarlar.MIN_FON_BUYUKLUK_TL'yi
aşan fon evrenini sekiz kategoriye ayırır (BIST hisse yoğun, yabancı hisse,
teknoloji/tema, değişken, borçlanma/eurobond, para piyasası, karma, katılım),
her kategoride son ayarlar.PERFORMANS_AY aylık getiriye göre en iyi
ayarlar.KATEGORI_TOP_N fonu seçer; finalistler için Sharpe oranı, maksimum
drawdown ve stopaj oranını hesaplar, aralarındaki korelasyon matrisini çıkarır.

Not: TEFAS'ın kategori (fonTurAciklama), büyüklük (portfoyBuyukluk) ve
varlık dağılımı (yhs vb.) alanları tek bir toplu istekle, TÜM fon evreni
için çekilir (~2000 fon, tek HTTP isteği). Sadece finalistlerin günlük
fiyat geçmişi teker teker çekilir (Sharpe/drawdown/korelasyon için).

Kategori sınıflandırması kural tabanlıdır (bkz. kategori_belirle) ve
kesin değildir — özellikle Hisse Senedi Şemsiye Fonu'nun üç alt kümeye
(BIST hisse yoğun / yabancı hisse / teknoloji-tema) ayrımı fon unvanındaki
anahtar kelimelere ve yabancı hisse oranına dayanır. Şüpheli durumlarda
--kaydet ile üretilen markdown/CSV çıktısını gözden geçir.

Kullanım:
    python performans_rapor.py             # ekrana yazdırır
    python performans_rapor.py --kaydet     # performans_rapor_YYYY-AA.md +
                                             # korelasyon_matrisi_YYYY-AA.csv
"""

import argparse
import sys
import time
import unicodedata
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from ayarlar import (KATEGORI_TOP_N, MIN_FON_BUYUKLUK_TL, PERFORMANS_AY,
                     RISKSIZ_YILLIK_ORAN, STOPAJ_ORANLARI)

KLASOR = Path(__file__).parent
ROOT_URL = "https://www.tefas.gov.tr"
INFO_ENDPOINT = "/api/funds/fonGnlBlgSiraliGetir"     # fiyat, büyüklük, yatırımcı sayısı
DIST_ENDPOINT = "/api/funds/dagilimSiraliGetirT"      # varlık dağılımı yüzdeleri
LIST_ENDPOINT = "/api/funds/fonGetiriBazliBilgiGetir" # kategori + dönemsel getiri
HEADERS = {
    "Accept": "*/*",
    "Content-Type": "application/json",
    "Origin": ROOT_URL,
    "Referer": ROOT_URL + "/tr/fon-verileri",
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
}

# TEFAS API'sinin kabul ettiği periyotlar; en yakın üste yuvarlanır.
_GECERLI_AYLAR = (1, 3, 6, 12, 36, 60)
_GETIRI_ALANI = {1: "getiri1a", 3: "getiri3a", 6: "getiri6a",
                 12: "getiri1y", 36: "getiri3y", 60: "getiri5y"}

TEMA_ANAHTAR = ("TEKNOLOJI", "TEMA", "SEKTOR", "ENERJI", "SAGLIK", "GIDA",
               "BANKACILIK", "SANAYI", "HABERLESME", "PERAKENDE", "OTOMOTIV")

HEDEF_KATEGORILER = ["BIST hisse yoğun", "yabancı hisse", "teknoloji/tema",
                     "değişken", "borçlanma/eurobond", "para piyasası",
                     "karma", "katılım"]


def _normalize(metin: str) -> str:
    """Türkçe karakterleri sadeleştirip büyük harfe çevirir (anahtar kelime eşleşmesi için)."""
    metin = metin.upper()
    cevrim = str.maketrans("İIŞŞĞÜÖÇ", "IISSGUOC")
    metin = metin.translate(cevrim)
    return unicodedata.normalize("NFKD", metin).encode("ascii", "ignore").decode()


def _en_yakin_ay(ay: int) -> int:
    for p in _GECERLI_AYLAR:
        if p >= ay:
            return p
    return _GECERLI_AYLAR[-1]


def _do_post(session: requests.Session, endpoint: str, body: dict) -> list:
    r = session.post(ROOT_URL + endpoint, json=body, timeout=30)
    r.raise_for_status()
    return r.json().get("resultList") or []


def tum_fonlari_cek(session: requests.Session) -> pd.DataFrame | None:
    """Tüm YAT fon evrenini (büyüklük + dağılım + kategori/getiri) tek DataFrame'de birleştirir."""
    bugun = date.today().strftime("%Y%m%d")
    gnl_body = {
        "fonTipi": "YAT", "fonKodu": None, "aramaMetni": None, "fonTurKod": None,
        "fonGrubu": None, "sfonTurKod": None, "fonTurAciklama": None, "kurucuKod": None,
        "basTarih": bugun, "bitTarih": bugun, "basSira": 1, "bitSira": 100000,
        "dil": "TR", "sFonTurKod": "", "fonKod": "", "fonGrup": "", "fonUnvanTip": "",
    }
    try:
        gnl = _do_post(session, INFO_ENDPOINT, gnl_body)
        dagilim = _do_post(session, DIST_ENDPOINT, gnl_body)
    except Exception as e:
        print(f"[!] Fon evreni çekilemedi: {e}")
        return None
    if not gnl:
        return None

    liste_body = {
        "dil": "TR", "fonTipi": "YAT", "kurucuKodu": None, "sfonTurKod": None,
        "fonTurAciklama": None, "islem": 1, "fonTurKod": None, "fonGrubu": None,
        "donemGetiri1a": "1", "donemGetiri3a": "1", "donemGetiri6a": "1",
        "donemGetiri1y": "1", "donemGetiriyb": "1", "donemGetiri3y": "1",
        "donemGetiri5y": "1", "basTarih": None, "bitTarih": None,
        "calismaTipi": 2, "getiriOrani": "1",
    }
    try:
        liste = _do_post(session, LIST_ENDPOINT, liste_body)
    except Exception as e:
        print(f"[!] Kategori/getiri listesi çekilemedi: {e}")
        liste = []

    df_gnl = pd.DataFrame(gnl)[["fonKodu", "fonUnvan", "fiyat", "kisiSayisi", "portfoyBuyukluk"]]
    df_dag = pd.DataFrame(dagilim)[["fonKodu", "hs", "yhs"]].rename(
        columns={"hs": "yerli_hisse_yzd", "yhs": "yabanci_hisse_yzd"})
    df_liste = pd.DataFrame(liste)[["fonKodu", "fonTurAciklama",
                                    "getiri1a", "getiri3a", "getiri6a",
                                    "getiri1y", "getiri3y", "getiri5y"]] if liste else pd.DataFrame(
        columns=["fonKodu", "fonTurAciklama", "getiri1a", "getiri3a",
                "getiri6a", "getiri1y", "getiri3y", "getiri5y"])

    df = df_gnl.merge(df_dag, on="fonKodu", how="left").merge(df_liste, on="fonKodu", how="left")
    return df


def kategori_belirle(fon_unvan: str, fon_tur: str | None, yabanci_hisse_yzd: float | None) -> str | None:
    """Fonu sekiz hedef kategoriden birine atar; eşleşmezse None (taramaya dahil edilmez)."""
    if not fon_tur:
        return None
    unvan_n = _normalize(fon_unvan)

    if fon_tur == "Serbest Şemsiye Fonu":
        return None  # nitelikli yatırımcıya özel
    if fon_tur in ("Fon Sepeti Şemsiye Fonu", "Kıymetli Madenler Şemsiye Fonu"):
        return None  # istenen 8 kategori dışında

    if "KATILIM" in unvan_n:
        return "katılım"
    if fon_tur == "Borçlanma Araçları Şemsiye Fonu":
        return "borçlanma/eurobond"
    if fon_tur == "Değişken Şemsiye Fonu":
        return "değişken"
    if fon_tur == "Karma Şemsiye Fonu":
        return "karma"
    if fon_tur == "Para Piyasası Şemsiye Fonu":
        return "para piyasası"
    if fon_tur == "Hisse Senedi Şemsiye Fonu":
        if any(k in unvan_n for k in TEMA_ANAHTAR):
            return "teknoloji/tema"
        if (yabanci_hisse_yzd or 0) >= 50:
            return "yabancı hisse"
        return "BIST hisse yoğun"
    return None


def evreni_hazirla(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["kategori"] = [
        kategori_belirle(r.fonUnvan, r.fonTurAciklama, r.yabanci_hisse_yzd)
        for r in df.itertuples()
    ]
    df = df[df["kategori"].notna()]
    df = df[df["portfoyBuyukluk"].fillna(0) >= MIN_FON_BUYUKLUK_TL]

    getiri_alani = _GETIRI_ALANI[_en_yakin_ay(PERFORMANS_AY)]
    df["donem_getiri"] = df[getiri_alani]
    df = df[df["donem_getiri"].notna()]
    return df


def kategori_finalistleri(df: pd.DataFrame) -> pd.DataFrame:
    parcalar = []
    for kategori in HEDEF_KATEGORILER:
        alt = df[df["kategori"] == kategori].sort_values("donem_getiri", ascending=False)
        parcalar.append(alt.head(KATEGORI_TOP_N))
    if not parcalar:
        return df.iloc[0:0]
    return pd.concat(parcalar, ignore_index=True)


def gecmis_fiyatlari_cek(kodlar: list[str], ay: int) -> dict[str, pd.DataFrame]:
    """Finalistler için günlük fiyat geçmişini teker teker çeker (nazikçe, aralıklı)."""
    from tefas import Crawler
    crawler = Crawler()
    bugun = date.today()
    baslangic = bugun - timedelta(days=ay * 31)

    seriler = {}
    for i, kod in enumerate(kodlar):
        try:
            veri = crawler.fetch(start=str(baslangic), end=str(bugun), name=kod)
            if not veri.empty:
                seriler[kod] = veri.sort_values("date")[["date", "price"]].reset_index(drop=True)
        except Exception as e:
            print(f"[!] {kod}: fiyat geçmişi alınamadı -> {e}")
        if i < len(kodlar) - 1:
            time.sleep(1.0)  # TEFAS'ı hızlıca yormamak için
    return seriler


def sharpe_ve_drawdown(fiyat_df: pd.DataFrame, risksiz_yillik: float) -> tuple[float | None, float | None]:
    if len(fiyat_df) < 5:
        return None, None
    fiyat = fiyat_df["price"].astype(float)
    gunluk_getiri = fiyat.pct_change().dropna()
    if gunluk_getiri.std() == 0 or gunluk_getiri.empty:
        return None, None

    risksiz_gunluk = (1 + risksiz_yillik) ** (1 / 252) - 1
    sharpe = (gunluk_getiri.mean() - risksiz_gunluk) / gunluk_getiri.std() * (252 ** 0.5)

    tepe = fiyat.cummax()
    dusus = fiyat / tepe - 1
    max_dd = dusus.min()
    return float(sharpe), float(max_dd)


def korelasyon_matrisi(seriler: dict[str, pd.DataFrame]) -> pd.DataFrame:
    getiriler = {}
    for kod, df in seriler.items():
        s = df.set_index("date")["price"].astype(float).pct_change().dropna()
        if not s.empty:
            getiriler[kod] = s
    if len(getiriler) < 2:
        return pd.DataFrame()
    genis = pd.DataFrame(getiriler)
    return genis.corr()


def en_yuksek_dusuk_korelasyon(korelasyon: pd.DataFrame, n: int = 5) -> tuple[list, list]:
    if korelasyon.empty:
        return [], []
    ciftler = []
    kodlar = list(korelasyon.columns)
    for i, a in enumerate(kodlar):
        for b in kodlar[i + 1:]:
            ciftler.append((a, b, korelasyon.loc[a, b]))
    ciftler.sort(key=lambda x: x[2], reverse=True)
    return ciftler[:n], ciftler[-n:][::-1]


def yuzde(v) -> str:
    return f"{v:+.2f}%" if v is not None and pd.notna(v) else "n/a"


def raporu_yazdir(finalistler: pd.DataFrame, sharpe_dd: dict, korelasyon: pd.DataFrame) -> list[str]:
    donem = date.today().strftime("%Y-%m")
    getiri_alani_ad = f"{PERFORMANS_AY} aylık"
    md = [f"# TEFAS PERFORMANS RAPORU (DİKİZ AYNASI) - {donem}", "",
         f"Evren: nitelikli-yatırımcı-dışı, büyüklük ≥ {MIN_FON_BUYUKLUK_TL:,.0f} TL, "
         f"kategori başına ilk {KATEGORI_TOP_N} · pencere: {getiri_alani_ad} · "
         f"risksiz oran: %{RISKSIZ_YILLIK_ORAN * 100:g}", ""]

    print("=" * 100)
    print(f"TEFAS PERFORMANS RAPORU (DİKİZ AYNASI) - {donem}")
    print(f"Evren: büyüklük >= {MIN_FON_BUYUKLUK_TL:,.0f} TL, nitelikli-yatırımcı hariç, "
         f"kategori başına ilk {KATEGORI_TOP_N} · pencere: {getiri_alani_ad}")
    print("=" * 100)

    for kategori in HEDEF_KATEGORILER:
        alt = finalistler[finalistler["kategori"] == kategori]
        if alt.empty:
            continue
        stopaj = STOPAJ_ORANLARI.get(kategori)
        print(f"\n[{kategori}]  (stopaj: %{stopaj:g})" if stopaj is not None else f"\n[{kategori}]")
        md.append(f"## {kategori}" + (f" — stopaj %{stopaj:g}" if stopaj is not None else ""))
        md.append("")
        md.append("| Kod | Ad | Büyüklük (TL) | " + getiri_alani_ad + " Getiri | Sharpe | Maks. Drawdown |")
        md.append("|---|---|---:|---:|---:|---:|")
        for r in alt.itertuples():
            sd = sharpe_dd.get(r.fonKodu, (None, None))
            sharpe_str = f"{sd[0]:.2f}" if sd[0] is not None else "n/a"
            dd_str = f"{sd[1] * 100:.1f}%" if sd[1] is not None else "n/a"
            print(f"  {r.fonKodu:<6} {r.fonUnvan[:48]:<48} "
                 f"{r.portfoyBuyukluk:>18,.0f} TL  getiri {yuzde(r.donem_getiri):>9}  "
                 f"Sharpe {sharpe_str:>6}  MaxDD {dd_str:>7}")
            md.append(f"| {r.fonKodu} | {r.fonUnvan} | {r.portfoyBuyukluk:,.0f} | "
                     f"{yuzde(r.donem_getiri)} | {sharpe_str} | {dd_str} |")
        md.append("")

    print("\n" + "-" * 100)
    print(f"EN ÇOK KAZANDIRANLAR (tüm kategoriler, ilk 10, {getiri_alani_ad})")
    md += ["## En Çok Kazandıranlar (tüm kategoriler)", "",
          "| Kod | Kategori | " + getiri_alani_ad + " Getiri |", "|---|---|---:|"]
    for r in finalistler.sort_values("donem_getiri", ascending=False).head(10).itertuples():
        print(f"  {r.fonKodu:<6} {r.kategori:<18} {yuzde(r.donem_getiri):>9}")
        md.append(f"| {r.fonKodu} | {r.kategori} | {yuzde(r.donem_getiri)} |")

    if not korelasyon.empty:
        en_yuksek, en_dusuk = en_yuksek_dusuk_korelasyon(korelasyon)
        print("\n" + "-" * 100)
        print("EN YÜKSEK KORELASYONLU ÇİFTLER")
        md += ["", "## Korelasyon — en yüksek çiftler", "", "| Fon 1 | Fon 2 | Korelasyon |", "|---|---|---:|"]
        for a, b, v in en_yuksek:
            print(f"  {a} <-> {b}: {v:+.2f}")
            md.append(f"| {a} | {b} | {v:+.2f} |")
        print("\nEN DÜŞÜK (EN ÇOK ÇEŞİTLENDİREN) ÇİFTLER")
        md += ["", "## Korelasyon — en düşük çiftler", "", "| Fon 1 | Fon 2 | Korelasyon |", "|---|---|---:|"]
        for a, b, v in en_dusuk:
            print(f"  {a} <-> {b}: {v:+.2f}")
            md.append(f"| {a} | {b} | {v:+.2f} |")
        md += ["", "Tam korelasyon matrisi için `korelasyon_matrisi_" + donem + ".csv` dosyasına bakın."]

    print("=" * 100)
    return md


def main() -> None:
    p = argparse.ArgumentParser(description="TEFAS kategori bazlı performans taraması (Sharpe, max drawdown, korelasyon)")
    p.add_argument("--kaydet", action="store_true",
                   help="Raporu performans_rapor_YYYY-AA.md ve korelasyon_matrisi_YYYY-AA.csv olarak kaydet")
    args = p.parse_args()

    session = requests.Session()
    session.headers.update(HEADERS)

    print("Fon evreni çekiliyor (tek istek, ~2000 fon)...")
    df = tum_fonlari_cek(session)
    if df is None or df.empty:
        print("Fon evreni çekilemedi; internet bağlantısını kontrol et.")
        return

    df = evreni_hazirla(df)
    finalistler = kategori_finalistleri(df)
    if finalistler.empty:
        print("Filtrelere uyan fon bulunamadı. ayarlar.MIN_FON_BUYUKLUK_TL değerini gözden geçir.")
        return

    kodlar = finalistler["fonKodu"].tolist()
    print(f"{len(kodlar)} finalist için günlük fiyat geçmişi çekiliyor "
         f"(~{len(kodlar)} saniye sürebilir)...")
    seriler = gecmis_fiyatlari_cek(kodlar, PERFORMANS_AY)

    sharpe_dd = {kod: sharpe_ve_drawdown(df_, RISKSIZ_YILLIK_ORAN) for kod, df_ in seriler.items()}
    korelasyon = korelasyon_matrisi(seriler)

    md = raporu_yazdir(finalistler, sharpe_dd, korelasyon)

    if args.kaydet:
        donem = date.today().strftime("%Y-%m")
        rapor_yolu = KLASOR / f"performans_rapor_{donem}.md"
        rapor_yolu.write_text("\n".join(md) + "\n", encoding="utf-8")
        print(f"\nRapor kaydedildi: {rapor_yolu}")
        if not korelasyon.empty:
            kor_yolu = KLASOR / f"korelasyon_matrisi_{donem}.csv"
            korelasyon.to_csv(kor_yolu)
            print(f"Korelasyon matrisi kaydedildi: {kor_yolu}")


if __name__ == "__main__":
    main()
