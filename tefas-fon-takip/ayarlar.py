"""
Ortak ayarlar - tüm betikler (fon_takip, kap_rapor, drift_rapor, rapor_html)
burayı okur. Kendi portföyüne ve planına göre bu dosyayı düzenle.
"""

# --- V1: Takip edilen fonlar -------------------------------------------
FONLAR = ["YAY", "YBE", "ZIH", "YLB", "PHE", "AFA", "AES", "TP2"]  # istediğin gibi düzenle
GUN_SAYISI = 7        # son kaç güne bakılsın (hafta sonu/tatil payı için)
CSV_KAYDET = True     # True ise sonuçları fon_dagilim.csv olarak kaydeder

# --- V4: Görsel rapor (rapor_html.py) ----------------------------------
GRAFIK_GUN = 30       # rapordaki mini fiyat grafiklerinin penceresi (gün)

# Opsiyonel: fon kodu -> ortalama alış fiyatı (TL). Doldurduğun fonlar için
# raporda Kar/Zarar kolonları ve özette toplam K/Z kartı görünür.
# Örnek: MALIYETLER = {"YAY": 1750.0, "PHE": 3.20}
MALIYETLER = {}

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

# --- V5: TEFAS performans taraması (performans_rapor.py) ---------------
# Taranacak evren: nitelikli yatırımcıya özel olmayan ("Serbest Şemsiye
# Fonu" hariç) ve büyüklüğü en az bu kadar TL olan fonlar.
MIN_FON_BUYUKLUK_TL = 500_000_000.0

# Kategori başına en iyi kaç fon alınsın (getiriye göre).
KATEGORI_TOP_N = 5

# Geriye dönük bakış penceresi (ay). TEFAS API'si yalnızca
# {1, 3, 6, 12, 36, 60} değerlerini kabul eder.
PERFORMANS_AY = 12

# Sharpe oranı için yıllık risksiz getiri varsayımı (TL). Otomatik/güvenilir
# bir kaynağı yok — TL para piyasası/mevduat seviyesine göre elle güncelle.
RISKSIZ_YILLIK_ORAN = 0.45

# Kategori -> stopaj oranı (%). Yalnızca sürekli asgari %80 BIST hissesi
# taşıyan "hisse yoğun" fonlar %0 stopaja tabi; diğerlerinde genel oran
# kullanılmıştır. Mevzuat değişebilir — kullanmadan önce güncel oranı
# (GİB/aracı kurum) teyit et.
STOPAJ_ORANLARI = {
    "BIST hisse yoğun": 0.0,
    "yabancı hisse": 17.5,
    "teknoloji/tema": 17.5,
    "değişken": 17.5,
    "borçlanma/eurobond": 17.5,
    "para piyasası": 17.5,
    "karma": 17.5,
    "katılım": 17.5,
}

# --- V6: BIST temel analiz taraması (bist_tarama.py) --------------------
# Taranacak hisseler (BIST kodu, "XXXXX" formatında, .IS eki olmadan).
# isyatirimhisse üzerinden bilanço/gelir tablosu ve fiyat çekildiği için
# rate-limit ve kırılganlık riskine karşı listeyi elle küçük tutmak daha
# güvenilir — istediğin gibi genişlet.
HISSE_LISTESI = [
    "THYAO", "ASELS", "SISE", "KCHOL", "EREGL",
    "TUPRS", "BIMAS", "AKBNK", "GARAN", "FROTO",
]
