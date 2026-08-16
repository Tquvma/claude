# TEFAS Fon Takip

TEFAS fonlarını takip eden dört parçalı araç. Ortak ayarlar `ayarlar.py`
dosyasında — fon listesi, portföy adetleri, hedef dağılım ve (istenirse)
ortalama alış maliyetleri oradan düzenlenir.

## Kurulum

```bash
pip install -r requirements.txt
```

## V1 — Fiyat, günlük getiri ve kategori sırası (`fon_takip.py`)

```bash
python fon_takip.py
```

`ayarlar.py` içindeki `FONLAR` listesindeki her fon için son fiyatı, günlük
getiriyi ve fonun kategorisindeki sırasını TEFAS'tan çeker, ekrana yazar;
`CSV_KAYDET = True` iken `fon_dagilim.csv` dosyasına da kaydeder.

> Not: TEFAS'ın yeni API'si varlık sınıfı dağılımını artık yayımlamıyor;
> fon bazlı dağılım için V2'deki KAP raporu kullanılabilir.

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

## V4 — Etkileşimli görsel rapor (`rapor_html.py`)

```bash
python rapor_html.py            # güncel veriyle rapor.html üretir
python rapor_html.py --ac       # üretip tarayıcıda açar
python rapor_html.py --onbellek # ağa çıkmadan son çekimin verisiyle üretir
```

Windows'ta en kolayı: **`rapor.bat`'a çift tıkla** — raporu üretir ve
tarayıcıda açar.

Tek sayfada neler var:

- Özet kartları, dağılım donut'u ve drift barları (hover ipuçlarıyla)
- Her fon satırında son `GRAFIK_GUN` (varsayılan 30) günün mini fiyat
  grafiği ve dönem getirisi; başlığa tıklayarak tablo sıralanır
- **Adet ve nakit alanları elle değiştirilebilir** — tüm sayfa anında
  yeniden hesaplanır. Girilen değerler tarayıcıda (localStorage) saklanır,
  rapor yeniden üretilse de kaybolmaz; "ayarlar.py değerlerine dön"
  düğmesiyle sıfırlanır. Kalıcı Kaydet kartındaki metni `ayarlar.py`'ye
  yapıştırarak diğer betiklerle de paylaşabilirsin.
- `ayarlar.py`'de `MALIYETLER` doldurulursa Kar/Zarar kolonları ve özette
  toplam K/Z kartı görünür
- Her üretimde portföy değeri `portfoy_gecmis.csv`'ye kaydedilir; farklı
  günlerde üretmeye devam ettikçe raporda zaman grafiği oluşur
- Son başarılı çekim `veri_onbellek.json`'a yazılır; TEFAS'a ulaşılamazsa
  rapor bu önbellekten üretilir ve sayfada uyarı gösterilir

`rapor.html`, `veri_onbellek.json` ve `portfoy_gecmis.csv` kişisel veri
içerdiği için `.gitignore`'dadır, depoya gitmez.
