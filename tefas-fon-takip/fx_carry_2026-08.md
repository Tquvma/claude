# TL TAŞIMA (CARRY) GETİRİSİ - 2026-08

## Ham veri

| Gösterge | Değer | Tarih/Kaynak |
|---|---:|---|
| TCMB politika faizi (1 hafta repo) | %37.00 | Değişmedi, sonraki PPK 10 Eylül 2026 — tcmb.gov.tr |
| USD/TRY spot | 47.94 | 2026-08-19, alanchand.com |
| USD/TRY beklenti — 2026 yıl sonu | 51.66 | TCMB Piyasa Katılımcıları Anketi, Ağustos 2026 (68 katılımcı) |
| USD/TRY beklenti — 12 ay sonrası | 57.43 | Aynı anket |
| Fed politika faizi (karşılaştırma) | %3.50–3.75 (efektif %3.63) | 17 Haziran 2026 FOMC, federalreserve.gov |
| TP2 (para piyasası) 12 aylık getiri | %60.31 | TEFAS, 2026-08-19 |
| TP2 son 30 gün yıllıklandırılmış | %96.40 | TEFAS fiyat serisi, 2026-08-19 |
| YLB (para piyasası) 12 aylık getiri | veri yok (TEFAS'ta yayımlanmıyor) | TEFAS, 2026-08-19 |
| YLB son 30 gün yıllıklandırılmış | %73.42 | TEFAS fiyat serisi, 2026-08-19 |
| Para piyasası fonu stopajı | %17.5 | `ayarlar.STOPAJ_ORANLARI` |

## Beklenen TL değer kaybı (USD karşısında)

- **Yıl sonuna kadar** (~4.4 ay, anket bazlı): (51.66 − 47.94) / 47.94 = **%7.76**
- **12 ay ufkunda** (anket bazlı): (57.43 − 47.94) / 47.94 = **%19.80**

## Dolar bazlı carry hesabı

Formül: `carry = (1 + TL faiz getirisi) / (1 + beklenen TL değer kaybı) − 1`
(kapsanmamış faiz paritesi / UIP yaklaşımı, 12 aylık ufuk)

| Referans TL getirisi | Hesap | Dolar bazlı carry |
|---|---|---:|
| TCMB politika faizi (%37, pre-tax, "ileriye dönük" en savunulabilir referans) | (1.37 / 1.1980) − 1 | **≈ %14.4** |
| TP2 12 aylık trailing getiri, brüt (%60.31) | (1.6031 / 1.1980) − 1 | ≈ %33.8 |
| TP2 12 aylık trailing getiri, stopaj sonrası net (%49.76) | (1.4976 / 1.1980) − 1 | ≈ %25.0 |
| YLB son 30 gün yıllıklandırılmış, stopaj sonrası net (%60.57) | (1.6057 / 1.1980) − 1 | ≈ %34.0 |

**Önemli uyarı — bu dört rakam birbiriyle tutarsız ve bilerek öyle
bırakıldı:** TP2/YLB'nin gerçekleşen (trailing) getirileri (%60-96
yıllıklandırılmış), güncel TCMB politika faizinin (%37) belirgin şekilde
üzerinde. Para piyasası fonu için bu normal değil — muhtemelen (a) fonlar
kısa vadeli TL tahvil/bono taşıyor ve yıl içinde faizler daha yüksek bir
seviyeden düşerken fiyat kazancı (capital gain) yakalamış olabilirler,
ya da (b) trailing 12 aylık pencere, şu anki %37'den daha yüksek olduğu
önceki bir dönemi de içeriyor olabilir. **Geçmiş 12 aylık fon getirisi,
önümüzdeki 12 ay için güvenilir bir carry tahmini değildir** — ileriye
dönük planlama için **politika faizi bazlı ~%14 rakamı** daha savunulabilir
bir referans; TP2/YLB'nin gerçekleşen getirisiyle hesaplanan %25-34
aralığı ise "geçmişte fiilen ne kazanıldığı"nı gösterir, tekrarlanacağının
garantisi yok.

Sonuç: hangi referans kullanılırsa kullanılsın **dolar bazlı carry
pozitif** — yani son 12 ayda (ve TCMB'nin güncel faiz duruşu sürdüğü
sürece ileriye dönük de) TL'de kalmanın dolarda kalmaya göre dolar bazında
daha iyi getiri sağladığı görülüyor. Ancak bu, TCMB'nin faiz indirim
temposunu koruyacağı ve kur beklentisinin gerçekleşeceği varsayımına
dayanıyor — politika değişikliği veya beklenenden hızlı devalüasyon bu
tabloyu tersine çevirebilir.

## Döviz-tutma yöntemleri karşılaştırması

| Yöntem | Getiri | Stopaj/Vergi | Likidite | Notlar |
|---|---|---|---|---|
| **Fiziki nakit (dolar banknot)** | %0 (sadece TL değer kaybından korur) | Yok | Yüksek (anlık) ama fiziksel saklama riski | Döviz büfe al-sat spread'i (~%1-3) giriş/çıkışta maliyet yaratır; büyük tutarlar için pratik/güvenli değil |
| **YBE (TEFAS eurobond/dolar borçlanma fonu)** | 12 aylık %26.08 (TL bazında, TEFAS) | %17.5 (borçlanma/eurobond kategorisi) | Orta — TEFAS alım-satım, T+birkaç gün valör | TL hesap üzerinden erişilebilir, yurt dışı aracı kurum gerektirmez; getiri fonun dolar cinsi tahvillerinin TL karşılığı, saf "dolar tutma" değil, kredi/faiz riski de taşır |
| **Dolar bazlı ETF (VOO vb.)** | Seçilen ETF'e göre değişir (bkz. `etf_tarama_2026-08.md`) — bu "döviz tutma" değil, gerçek bir yatırım riski | Stopaj değil, GVK'ya tabi beyan esası (yurt dışı hisse/ETF kazancı) — **kesin oran için mali müşavire danışılmalı, burada uydurulmadı** | Düşük-orta — ABD borsa saatleri, yurt dışı aracı kurum hesabı ve transfer gerektirir, işlem+transfer maliyeti var | Sadece dolar tutmak isteyen biri için "aşırı" bir araç — asıl amacı yatırım getirisi, kur riskinden korunma yan etkisi |

**Özet**: Fiziki nakit en likit ama getirisiz ve saklama riski taşıyor;
YBE, TL sisteminin içinde kalarak dolar maruziyeti almanın en pratik yolu
(vergi ve likidite açısından orta maliyetli); ETF ise döviz tutma aracı
değil, ayrı bir yatırım kararı — üçünü birbirinin ikamesi gibi
değerlendirmemek gerekir.
