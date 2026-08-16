"""
Ortak ayarlar - tüm betikler (fon_takip, kap_rapor, drift_rapor) burayı okur.
Kendi portföyüne ve planına göre bu dosyayı düzenle.
"""

# --- V1: Takip edilen fonlar -------------------------------------------
FONLAR = ["YAY", "YBE", "ZIH", "YLB", "PHE", "AFA", "AES", "TP2"]  # istediğin gibi düzenle
GUN_SAYISI = 7        # son kaç güne bakılsın (hafta sonu/tatil payı için)
CSV_KAYDET = True     # True ise sonuçları fon_dagilim.csv olarak kaydeder

# --- V3: Portföyün -----------------------------------------------------
# Fon kodu -> elindeki pay adedi. Drift raporu bu adetleri güncel fiyatla
# çarparak gerçekleşen dağılımı hesaplar. Kendi adetlerinle doldur.
PORTFOY = {
    "YAY": 10,
    "YBE": 10,
    "ZIH": 50,
    "YLB": 2000,
    "PHE": 50,
    "AFA": 100,
    "AES": 25,
    "TP2": 800,
}

# Fon dışında tuttuğun nakit (TL). Toplam portföy değerine dahil edilir.
NAKIT_TL = 50_000.0

# --- V3: Hedef dağılım -------------------------------------------------
# Grup adı -> {"fonlar": [...], "hedef_yuzde": ...}
# "NAKIT" özel koddur, NAKIT_TL'yi temsil eder.
# hedef_yuzde toplamı 100 olmalı; değilse rapor uyarır.
HEDEFLER = {
    "Sepet": {"fonlar": ["YAY", "YBE", "ZIH", "YLB", "AFA", "AES", "TP2"], "hedef_yuzde": 40},
    "PHE":   {"fonlar": ["PHE"], "hedef_yuzde": 20},
    # Kalan %40'ı kendi planına göre düzenle (ör. yeni gruplar ekle,
    # Sepet'i böl, ya da nakit hedefi koy):
    "Nakit": {"fonlar": ["NAKIT"], "hedef_yuzde": 40},
}

# Sapma eşiği (yüzde puan). |gerçek - hedef| bu değeri aşarsa uyarı verilir.
DRIFT_ESIK = 5.0
