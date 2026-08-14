# TEFAS Fon Takip

TEFAS fonlarını takip eden üç parçalı komut satırı aracı. Ortak ayarlar
`ayarlar.py` dosyasında — fon listesi, portföy adetleri ve hedef dağılımı
oradan düzenlenir.

## Kurulum

```bash
pip install -r requirements.txt
```

## V1 — Fiyat ve varlık dağılımı (`fon_takip.py`)

```bash
python fon_takip.py
```

`ayarlar.py` içindeki `FONLAR` listesindeki her fon için son fiyatı ve varlık
sınıfı dağılımını TEFAS'tan çeker, ekrana yazar; `CSV_KAYDET = True` iken
`fon_dagilim.csv` dosyasına da kaydeder.

## V2 — KAP aylık rapordan ilk 10 hisse (`kap_rapor.py`)

Fonun KAP'ta yayımlanan aylık portföy dağılım raporundan hisse bazlı ilk 10
pozisyonu çıkarır.

```bash
# Güvenilir yol: raporu kap.org.tr'den elle indir, dosyayı ver
python kap_rapor.py --fon PHE --dosya PHE_aylik_rapor.xlsx

# Deneysel: son raporu KAP'tan otomatik indirmeyi dene
python kap_rapor.py --fon PHE
```

Rapor dosyası: kap.org.tr → fonu ara → Bildirimler → "Portföy Dağılım
Raporu" (aylık) → ekindeki Excel'i kaydet. Otomatik indirme KAP'ın site
yapısına bağlıdır; kırılırsa `--dosya` yolu her zaman çalışır.

## V3 — Hedef vs gerçekleşen drift raporu (`drift_rapor.py`)

`ayarlar.py`'deki hedef dağılım (`HEDEFLER`, ör. %40 Sepet, %20 PHE, %40
Nakit) ile portföyünün gerçekleşen dağılımını karşılaştırır; ±`DRIFT_ESIK`
(varsayılan 5) puanı aşan sapmaları işaretler ve hedefe dönmek için gereken
al/sat tutarını önerir.

```bash
python drift_rapor.py --demo      # ağ gerektirmeden örnek çıktı
python drift_rapor.py --kaydet    # gerçek veri + drift_rapor_YYYY-AA.md
```

Gerçek kullanım için önce `ayarlar.py`'de doldur:

- `PORTFOY` — fon kodu → elindeki pay adedi
- `NAKIT_TL` — fon dışı nakit
- `HEDEFLER` — grup → fon listesi + hedef yüzde (toplam 100 olmalı;
  `"NAKIT"` özel kodu nakdi temsil eder)

Aylık düzen için ay başında `python drift_rapor.py --kaydet` çalıştırman
yeterli; rapor `drift_rapor_YYYY-AA.md` olarak birikir.
