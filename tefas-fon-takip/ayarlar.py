"""
Ortak ayarlar - tüm betikler (fon_takip, kap_rapor, drift_rapor) burayı okur.
Kendi portföyüne ve planına göre bu dosyayı düzenle.
"""

# --- V1: Takip edilen fonlar -------------------------------------------
FONLAR = ["YAY", "YBE", "PHE", "AFA", "AES", "TP2", "YFAY1"]  # istediğin gibi düzenle
GUN_SAYISI = 7        # son kaç güne bakılsın (hafta sonu/tatil payı için)
CSV_KAYDET = True     # True ise sonuçları fon_dagilim.csv olarak kaydeder

# --- V3: Portföyün -----------------------------------------------------
# Fon kodu -> elindeki pay adedi. Drift raporu bu adetleri güncel fiyatla
# çarparak gerçekleşen dağılımı hesaplar. Kendi adetlerinle doldur.
PORTFOY = {
    "YAY": 0,
    "YBE": 0,
    "PHE": 0,
    "AFA": 0,
    "AES": 0,
    "TP2": 0,
    "YFAY1": 0,
}

# Fon dışında tuttuğun nakit (TL). Toplam portföy değerine dahil edilir.
NAKIT_TL = 0.0

# --- V3: Hedef dağılım -------------------------------------------------
# Grup adı -> {"fonlar": [...], "hedef_yuzde": ...}
# "NAKIT" özel koddur, NAKIT_TL'yi temsil eder.
# hedef_yuzde toplamı 100 olmalı; değilse rapor uyarır.
HEDEFLER = {
    "Sepet": {"fonlar": ["YAY", "YBE", "AFA", "AES", "TP2", "YFAY1"], "hedef_yuzde": 40},
    "PHE":   {"fonlar": ["PHE"], "hedef_yuzde": 20},
    # Kalan %40'ı kendi planına göre düzenle (ör. yeni gruplar ekle,
    # Sepet'i böl, ya da nakit hedefi koy):
    "Nakit": {"fonlar": ["NAKIT"], "hedef_yuzde": 40},
}

# Sapma eşiği (yüzde puan). |gerçek - hedef| bu değeri aşarsa uyarı verilir.
DRIFT_ESIK = 5.0
