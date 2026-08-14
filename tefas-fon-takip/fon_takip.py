"""
TEFAS Fon Takip - v1
Takip edilen fonların son fiyatını ve varlık dağılımını çeker.

Kurulum:
    pip install -r requirements.txt

Çalıştırma:
    python fon_takip.py
"""

from datetime import date, timedelta

import pandas as pd

from ayarlar import CSV_KAYDET, FONLAR, GUN_SAYISI

# Bu kolonlar dağılım yüzdesi DEĞİL; geri kalan sayısal kolonlar varlık dağılımıdır.
META_KOLONLAR = {"date", "code", "title", "price", "market_cap",
                 "number_of_shares", "number_of_investors"}


def son_veri(df: pd.DataFrame) -> pd.DataFrame:
    """Her fon için en güncel tarihli satırı döndürür."""
    df = df.sort_values("date")
    return df.groupby("code", as_index=False).tail(1)


def verileri_cek(fonlar=FONLAR, gun_sayisi=GUN_SAYISI) -> pd.DataFrame | None:
    """Her fonun son verisini TEFAS'tan çeker; hiç veri yoksa None döner.

    drift_rapor.py de bu fonksiyonu kullanır.
    """
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
    return son_veri(pd.concat(tum, ignore_index=True))


def main() -> None:
    data = verileri_cek()
    if data is None:
        print("Hiç veri çekilemedi. İnternet bağlantısını ve fon kodlarını kontrol et.")
        return

    for _, satir in data.iterrows():
        print("=" * 60)
        print(f"{satir['code']} - {satir.get('title', '')}")
        print(f"Tarih: {satir['date']}   Fiyat: {satir['price']}")
        print("Varlık dağılımı (%):")
        for kolon, deger in satir.items():
            if kolon in META_KOLONLAR:
                continue
            try:
                deger = float(deger)
            except (TypeError, ValueError):
                continue
            if deger > 0:
                print(f"  {kolon:<28} {deger:>6.2f}")

    if CSV_KAYDET:
        data.to_csv("fon_dagilim.csv", index=False)
        print("=" * 60)
        print("CSV kaydedildi: fon_dagilim.csv")


if __name__ == "__main__":
    main()
