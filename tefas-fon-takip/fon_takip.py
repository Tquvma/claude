"""
TEFAS Fon Takip - v1
Takip edilen fonların son fiyatını, günlük getirisini ve kategori sırasını çeker.

Not: TEFAS'ın yeni API'si varlık sınıfı dağılımını artık yayımlamıyor;
gelen veriler fiyat + kategori sıralamasından ibaret.

Kurulum:
    pip install -r requirements.txt

Çalıştırma:
    python fon_takip.py
"""

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from ayarlar import CSV_KAYDET, FONLAR, GUN_SAYISI

CSV_YOLU = Path(__file__).parent / "fon_dagilim.csv"


def son_veri(df: pd.DataFrame) -> pd.DataFrame:
    """Her fon için en güncel tarihli satırı döndürür."""
    df = df.sort_values("date")
    return df.groupby("code", as_index=False).tail(1)


def ham_veri_cek(fonlar=FONLAR, gun_sayisi=GUN_SAYISI) -> pd.DataFrame | None:
    """Her fon için son gun_sayisi gündeki tüm satırları TEFAS'tan çeker."""
    from tefas import Crawler  # ağ gerektirmeyen kullanımları bloklamasın diye burada

    crawler = Crawler()
    bugun = date.today()
    baslangic = bugun - timedelta(days=gun_sayisi)

    tum = []
    for kod in fonlar:
        try:
            df = crawler.fetch(start=str(baslangic), end=str(bugun), name=kod)
            if df.empty:
                print(f"[!] {kod}: veri gelmedi")
                continue
            tum.append(df)
        except Exception as e:
            print(f"[!] {kod}: hata -> {e}")

    if not tum:
        return None
    return pd.concat(tum, ignore_index=True)


def verileri_cek(fonlar=FONLAR, gun_sayisi=GUN_SAYISI) -> pd.DataFrame | None:
    """Her fonun son verisini TEFAS'tan çeker; hiç veri yoksa None döner.

    drift_rapor.py de bu fonksiyonu kullanır.
    """
    ham = ham_veri_cek(fonlar, gun_sayisi)
    if ham is None:
        return None
    return son_veri(ham)


def gunluk_getiri(ham: pd.DataFrame) -> dict[str, float]:
    """Her fon için son iki günün fiyatına göre günlük getiri yüzdesini döndürür."""
    getiriler = {}
    for kod, grup in ham.sort_values("date").groupby("code"):
        if len(grup) < 2:
            continue
        onceki, son = grup.iloc[-2]["price"], grup.iloc[-1]["price"]
        if onceki:
            getiriler[kod] = (son - onceki) / onceki * 100
    return getiriler


def main() -> None:
    ham = ham_veri_cek()
    if ham is None:
        print("Hiç veri çekilemedi. İnternet bağlantısını ve fon kodlarını kontrol et.")
        return

    data = son_veri(ham)
    getiriler = gunluk_getiri(ham)

    for _, satir in data.iterrows():
        print("=" * 60)
        print(f"{satir['code']} - {satir.get('title', '')}")
        getiri = getiriler.get(satir["code"])
        getiri_str = f"{getiri:+.2f}%" if getiri is not None else "n/a"
        print(f"Tarih: {satir['date']}   Fiyat: {satir['price']}   Günlük getiri: {getiri_str}")
        rank, toplam_fon = satir.get("category_rank"), satir.get("category_total")
        if pd.notna(rank) and pd.notna(toplam_fon) and rank > 0:
            print(f"Kategori sırası: {int(rank)} / {int(toplam_fon)}")

    if CSV_KAYDET:
        data.to_csv(CSV_YOLU, index=False)
        print("=" * 60)
        print(f"CSV kaydedildi: {CSV_YOLU}")


if __name__ == "__main__":
    main()
