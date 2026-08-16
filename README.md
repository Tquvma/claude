# Bütçe — günlük gelir gider takibi

Paranın nereye gittiğini, nereden geldiğini ve bütçenin ne durumda olduğunu tek
sayfada gösteren, sunucusuz bir web uygulaması.

**Veriler yalnızca tarayıcıda (`localStorage`) saklanır.** Hiçbir şey sunucuya
gönderilmez, hesap açmak gerekmez. Buna karşılık tarayıcı verisi silinirse
kayıtlar da gider — Ayarlar sekmesinden düzenli olarak JSON yedeği alın.

## Neler var

- **Panel** — gelir, gider, net ve tasarruf oranı kartları (geçen aya göre değişimle);
  giderin kategoriye, gelirin kaynağa göre dağılımı; ay içi günlük harcama; kümülatif
  bakiye; son 12 ayın karşılaştırması; hesap bazlı giren/çıkan ve bakiye; bütçe
  durumu; en büyük harcamalar; kategori × ay gelir-gider tablosu.
- **İşlemler** — arama ve tür/kategori/hesap/dönem filtreleriyle tam liste,
  satır içi düzenleme ve silme.
- **Tekrarlayanlar** — maaş, kira, abonelik gibi sabit kalemler. Kural bir kez
  tanımlanır, kaçırılan tüm tekrarlar sayfa her açıldığında otomatik işlenir.
- **Bütçe** — kategori başına aylık limit, aşım uyarısı ve "ayın kalan gününde
  günlük ne kadar harcayabilirsiniz" hesabı.
- **Ayarlar** — kategori ve hesap yönetimi, para birimi, tema, JSON dışa/içe aktarma.

Arayüz tamamen Türkçe; tutarlar ve tarihler `tr-TR` biçiminde. Tutar girerken
`1.234,56` da `1234.56` da kabul edilir. Açık/koyu tema desteklenir.

## Çalıştırma

Derleme adımı ve bağımlılık yok.

```bash
# en basiti: dosyayı doğrudan aç
open index.html

# ya da yerel sunucu
python3 -m http.server 8000
```

### GitHub Pages'te yayınlama

Repo ayarlarından **Settings → Pages → Source: Deploy from a branch** seçin,
dal olarak bu dalı ve klasör olarak `/ (root)` işaretleyin. Site birkaç dakika
içinde `https://<kullanıcı>.github.io/<repo>/` adresinde yayına girer.

### Tek dosyalık sürüm

```bash
node tools/build-artifact.mjs   # -> dist/artifact.html
```

Tüm CSS ve JS'i tek HTML dosyasına gömer; harici istek yapmadığı için katı
içerik güvenliği politikası altında da çalışır.

## Klavye kısayolları

| Tuş | İşlev |
|---|---|
| `N` | Yeni işlem |
| `←` `→` | Önceki / sonraki ay |
| `Esc` | Açık pencereyi kapat |

## Kod yapısı

| Dosya | Sorumluluk |
|---|---|
| `assets/js/util.js` | Tarih işlemleri, `tr-TR` biçimlendirme, tutar ayrıştırma |
| `assets/js/store.js` | Şema, `localStorage` kalıcılığı, CRUD, yedekleme, örnek veri |
| `assets/js/recurring.js` | Tekrar tarihlerinin üretimi ve idempotan işleme |
| `assets/js/analytics.js` | Saf hesaplama: özetler, kırılımlar, seriler, bütçe, pivot |
| `assets/js/charts.js` | SVG donut / sütun / çizgi çizimi, hover ve ipucu katmanı |
| `assets/js/ui.js` | Görünüm durumu, çizim, formlar |
| `assets/js/app.js` | Başlatma, olay bağlama, tema, dışa/içe aktarma |

Birkaç tasarım kararı:

- **Tutarlar pozitif saklanır**, yön ayrı bir `type` alanından okunur — işaret
  hataları baştan elenir.
- **Tekrarlayan işlemler `occurrenceKey` (kural + tarih) ile yazılır.** Sayfa kaç
  kez yenilenirse yenilensin aynı tekrar iki kez oluşmaz.
- **Kategoriler renk yerine palet yuvası taşır.** Yuva CSS'te `--series-N`
  değişkenine karşılık gelir ve açık/koyu temada ayrı tanımlıdır; renk kategoriye
  sabittir, sıralamaya göre değişmez. Renkler renk körlüğü ayrımı, kontrast ve
  açıklık bandı açısından doğrulanmış bir paletten gelir; grafikler en fazla 8
  dilim çizip kalanını "Diğer"e katlar.
- **Tek eksen kuralı.** Günlük harcama ile kümülatif bakiye aynı birimde ama çok
  farklı büyüklükte olduğu için ikinci bir y ekseni yerine ayrı grafiklere ayrıldı.

## Diğer araçlar

- [`tefas-fon-takip/`](tefas-fon-takip/README.md) — TEFAS fon fiyatlarını
  çeken, hedef dağılıma göre drift hesaplayan ve etkileşimli bir HTML
  raporu üreten bağımsız Python araç seti.
