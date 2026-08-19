"""
BIST Tarama - v6
ayarlar.HISSE_LISTESI'ndeki hisseler için İş Yatırım'ın kamuya açık bilanço/
gelir tablosu ve fiyat uç noktalarından F/K oranı, net nakit (nakit ve nakit
benzerleri - finansal borçlar) ve yurtdışı satış (döviz geliri) oranını
hesaplayıp sıralı bir tarama listesi üretir.

Kaynak: isyatirimhisse paketinin kullandığı aynı İş Yatırım JSON uç noktaları,
ama paketin kendi fonksiyonları yerine burada doğrudan istek atılıyor —
paketteki sabit 10 saniyelik zaman aşımı gerçek dünyada bu uç nokta için
yetersiz kalıyor (test sırasında zaman aşımına uğradı); burada 30 saniyeye
çıkarıldı ve SSL doğrulaması (isyatirim.com.tr'nin sertifika zinciri bazı
ortamlarda doğrulanamıyor) kapatıldı.

Bu resmi olmayan, dokümante edilmemiş bir uç nokta — kırılgan olabilir.
Bir hisse için veri gelmezse o hisse atlanır, diğerleri işlenmeye devam eder.

F/K = piyasa değeri (fiyat × sermaye/pay adedi) / son tamamlanmış mali yılın
net kârı. Not: mali tablodaki "Hisse Başına Kazanç" (3ZD) alanı şirketten
şirkete farklı ölçeklenmiş geliyor (bazısı TL, bazısı kuruş cinsinden) —
canlı veriyle karşılaştırmalı test edilip doğrulandı, bu yüzden EPS alanı
yerine piyasa değeri / net kâr yöntemi kullanılıyor.

Banka/finans şirketleri farklı bir mali tablo formatı (financial_group=3,
UFRS_K) kullanabilir ve XI_29 formatıyla veri dönmeyebilir — bu durumda
ilgili hisse "veri yok" olarak işaretlenir.

Kullanım:
    python bist_tarama.py             # ekrana yazdırır
    python bist_tarama.py --kaydet    # bist_tarama_YYYY-AA.md olarak kaydet
"""

import argparse
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from ayarlar import HISSE_LISTESI

KLASOR = Path(__file__).parent
FINANSAL_URL = "https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo"
FIYAT_URL = "https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil"
ZAMAN_ASIMI = 30

# itemCode'lar (İş Yatırım XI_29 mali tablo formatı)
KOD_NAKIT = "1AA"            # Nakit ve Nakit Benzerleri
KOD_KV_FINANSAL_BORC = "2AA"  # Kısa Vadeli Finansal Borçlar
KOD_UV_FINANSAL_BORC = "2BA"  # Uzun Vadeli Finansal Borçlar
KOD_NET_KAR = "3Z"            # Ana Ortaklık Payları (dönem net kârı)
KOD_YURTICI_SATIS = "4BC"     # Yurtiçi Satışlar
KOD_YURTDISI_SATIS = "4BD"    # Yurtdışı Satışlar


def mali_tablo_cek(session: requests.Session, symbol: str, yil: int,
                   financial_group: str = "XI_29") -> pd.DataFrame | None:
    params = {
        "companyCode": symbol, "exchange": "TRY", "financialGroup": financial_group,
        "year1": yil, "period1": 3, "year2": yil, "period2": 6,
        "year3": yil, "period3": 9, "year4": yil, "period4": 12,
    }
    try:
        r = session.get(FINANSAL_URL, params=params, timeout=ZAMAN_ASIMI, verify=False)
        r.raise_for_status()
        veri = r.json().get("value") or []
    except Exception as e:
        print(f"[!] {symbol} {yil}: mali tablo alınamadı -> {e}")
        return None
    if not veri:
        return None
    df = pd.DataFrame(veri)
    df.columns = list(df.columns[:3]) + [f"{yil}/3", f"{yil}/6", f"{yil}/9", f"{yil}/12"]
    return df


def hisse_mali_verisi(session: requests.Session, symbol: str) -> pd.DataFrame | None:
    """İki yıllık (bu yıl + geçen yıl) mali tabloyu birleştirir; son tam yıl garantiye alınır."""
    bu_yil = date.today().year
    parcalar = []
    for yil in (bu_yil - 1, bu_yil):
        df = mali_tablo_cek(session, symbol, yil)
        if df is not None:
            parcalar.append(df)
        time.sleep(0.4)
    if not parcalar:
        return None
    birlesik = parcalar[0]
    for ek in parcalar[1:]:
        birlesik = birlesik.merge(ek, on=["itemCode", "itemDescTr", "itemDescEng"], how="outer")
    return birlesik


def kalem_degeri(df: pd.DataFrame, item_code: str, yil_ay: str) -> float | None:
    satir = df[df["itemCode"] == item_code]
    if satir.empty or yil_ay not in df.columns:
        return None
    v = satir.iloc[0][yil_ay]
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def son_tam_yil_kolonu(df: pd.DataFrame) -> str | None:
    """'YYYY/12' biçimindeki kolonlardan en güncel olanı, veri doluysa döndürür."""
    yillik_kolonlar = sorted(
        [c for c in df.columns if c.endswith("/12")],
        key=lambda c: int(c.split("/")[0]), reverse=True)
    for kolon in yillik_kolonlar:
        if kalem_degeri(df, KOD_NET_KAR, kolon) is not None:
            return kolon
    return None


def fiyat_ve_sermaye_cek(session: requests.Session, symbol: str) -> tuple[float | None, float | None]:
    bugun = date.today()
    baslangic = bugun - timedelta(days=14)
    params = {"hisse": symbol, "startdate": baslangic.strftime("%d-%m-%Y"),
             "enddate": bugun.strftime("%d-%m-%Y")}
    try:
        r = session.get(FIYAT_URL, params=params, timeout=ZAMAN_ASIMI, verify=False)
        r.raise_for_status()
        veri = r.json().get("value") or []
    except Exception as e:
        print(f"[!] {symbol}: fiyat alınamadı -> {e}")
        return None, None
    if not veri:
        return None, None
    veri.sort(key=lambda x: datetime.strptime(x["HGDG_TARIH"], "%d-%m-%Y"))
    son = veri[-1]
    fiyat = float(son["HGDG_KAPANIS"])
    sermaye = float(son["SERMAYE"]) if son.get("SERMAYE") else None
    return fiyat, sermaye


def hisseyi_tara(session: requests.Session, symbol: str) -> dict:
    sonuc = {"kod": symbol, "fiyat": None, "yil": None, "fk": None,
            "net_nakit": None, "fx_gelir_yzd": None}

    sonuc["fiyat"], sermaye = fiyat_ve_sermaye_cek(session, symbol)

    mali = hisse_mali_verisi(session, symbol)
    if mali is None:
        print(f"[!] {symbol}: mali tablo verisi yok (banka/finans şirketiyse "
             f"financial_group=XI_29 uymuyor olabilir)")
        return sonuc

    yil_ay = son_tam_yil_kolonu(mali)
    if yil_ay is None:
        print(f"[!] {symbol}: tamamlanmış mali yıl verisi bulunamadı")
        return sonuc
    sonuc["yil"] = yil_ay.split("/")[0]

    # F/K = piyasa değeri / net kâr. "Hisse Başına Kazanç" alanı şirketten
    # şirkete farklı ölçeklendiği için (bkz. modül docstring'i) kullanılmıyor.
    net_kar = kalem_degeri(mali, KOD_NET_KAR, yil_ay)
    if net_kar and net_kar > 0 and sonuc["fiyat"] and sermaye:
        piyasa_degeri = sonuc["fiyat"] * sermaye
        sonuc["fk"] = piyasa_degeri / net_kar

    nakit = kalem_degeri(mali, KOD_NAKIT, yil_ay)
    kv_borc = kalem_degeri(mali, KOD_KV_FINANSAL_BORC, yil_ay) or 0.0
    uv_borc = kalem_degeri(mali, KOD_UV_FINANSAL_BORC, yil_ay) or 0.0
    if nakit is not None:
        sonuc["net_nakit"] = nakit - kv_borc - uv_borc

    yurtici = kalem_degeri(mali, KOD_YURTICI_SATIS, yil_ay)
    yurtdisi = kalem_degeri(mali, KOD_YURTDISI_SATIS, yil_ay)
    if yurtici is not None and yurtdisi is not None and (yurtici + yurtdisi) > 0:
        sonuc["fx_gelir_yzd"] = 100.0 * yurtdisi / (yurtici + yurtdisi)

    return sonuc


def sayi(v, ondalik=2) -> str:
    return f"{v:,.{ondalik}f}" if v is not None else "n/a"


def raporu_yazdir(sonuclar: list[dict]) -> list[str]:
    donem = date.today().strftime("%Y-%m")
    md = [f"# BIST TARAMA RAPORU - {donem}", "",
         "F/K yıllık (son tamamlanmış mali yıl) EPS'e göre · Net nakit = nakit ve nakit "
         "benzerleri − kısa+uzun vadeli finansal borçlar · FX gelir % = yurtdışı satışlar / "
         "toplam satışlar", "",
         "| Kod | Yıl | Fiyat | F/K | Net Nakit (TL) | FX Gelir % |",
         "|---|---:|---:|---:|---:|---:|"]

    print("=" * 100)
    print(f"BIST TARAMA RAPORU - {donem}")
    print("F/K: yıllık (son tam mali yıl) · Net Nakit = nakit − finansal borç · "
         "FX Gelir % = yurtdışı satış payı")
    print("-" * 100)
    print(f"{'Kod':<8}{'Yıl':>6}{'Fiyat':>12}{'F/K':>10}{'Net Nakit (TL)':>22}{'FX Gelir %':>12}")
    print("-" * 100)

    gecerli = [s for s in sonuclar if s["fk"] is not None]
    gecerli.sort(key=lambda s: s["fk"])
    diger = [s for s in sonuclar if s["fk"] is None]

    for s in gecerli + diger:
        print(f"{s['kod']:<8}{(s['yil'] or '—'):>6}{sayi(s['fiyat']):>12}"
             f"{sayi(s['fk']):>10}{sayi(s['net_nakit'], 0):>22}"
             f"{sayi(s['fx_gelir_yzd'], 1):>12}")
        md.append(f"| {s['kod']} | {s['yil'] or '—'} | {sayi(s['fiyat'])} | "
                 f"{sayi(s['fk'])} | {sayi(s['net_nakit'], 0)} | {sayi(s['fx_gelir_yzd'], 1)} |")
    print("=" * 100)
    return md


def main() -> None:
    p = argparse.ArgumentParser(
        description="BIST hisselerinde F/K, net nakit ve FX gelir taraması (isyatirim.com.tr)")
    p.add_argument("--kaydet", action="store_true", help="Raporu bist_tarama_YYYY-AA.md olarak kaydet")
    args = p.parse_args()

    if not HISSE_LISTESI:
        print("ayarlar.HISSE_LISTESI boş. Taramak istediğin BIST kodlarını ekle.")
        return

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})

    sonuclar = []
    for i, kod in enumerate(HISSE_LISTESI):
        print(f"[{i + 1}/{len(HISSE_LISTESI)}] {kod} taranıyor...")
        sonuclar.append(hisseyi_tara(session, kod))
        if i < len(HISSE_LISTESI) - 1:
            time.sleep(0.6)

    md = raporu_yazdir(sonuclar)

    if args.kaydet:
        donem = date.today().strftime("%Y-%m")
        yol = KLASOR / f"bist_tarama_{donem}.md"
        yol.write_text("\n".join(md) + "\n", encoding="utf-8")
        print(f"\nRapor kaydedildi: {yol}")


if __name__ == "__main__":
    main()
