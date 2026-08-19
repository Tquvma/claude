# ABD-LİSTELİ ETF TARAMA RAPORU - 2026-08

Evren kullanıcı tarafından elle sınırlandı (TEFAS taramasındaki gibi
otomatik bütün evreni çekmek yerine 9 aday karşılaştırıldı).

**Kaynaklar**: gider oranı/AUM → stockanalysis.com/etf/&lt;kod&gt;; 5 yıllık
getiri, standart sapma, maks. drawdown → lazyportfolioetf.com (veri tarihi
31 Temmuz 2026, pencere: son 5 yıl, aksi belirtilmedikçe). ABD 3 aylık
hazine bonosu getirisi: tradingeconomics.com, 18 Ağustos 2026, **%3.79**.

**Sharpe hesabı**: `(yıllık getiri − %3.79) / yıllık standart sapma`. Bu,
kaynağın kendi Sharpe rakamından farklı olabilir çünkü lazyportfolioetf.com
hangi risksiz oranı kullandığını sayfasında belirtmiyor — burada tutarlılık
için tüm ETF'lere aynı %3.79 risksiz oran ve aynı 5 yıllık pencere
uygulandı (QTUM ve URA hariç, aşağıda not edildi).

**SIRALAMA: Sharpe oranına göre** (ham getiriye göre değil).

| Kod | Kategori | Gider Oranı | AUM (USD) | 5y Getiri (yıllık) | Sharpe (rf=3.79%) | Maks. Drawdown |
|---|---|---:|---:|---:|---:|---:|
| GLD | Emtia (altın) | 0.40% | 145.12B | 16.95% | 0.80 | -23.85% |
| QTUM | Tematik — kuantum | 0.40% | 5.86B | 24.56% | 0.75 | -34.79% |
| VOO | Geniş piyasa | 0.03% | 1.03T | 12.82% | 0.57 | -23.91% |
| SPY | Geniş piyasa | 0.09% | 814.52B | 12.76% | 0.57 | -23.93% |
| QQQ | Nasdaq ağırlıklı | 0.18% | 488.91B | 14.23% | 0.50 | -32.58% |
| VTI | Geniş piyasa | 0.03% | 688.63B | 11.75% | 0.50 | -24.81% |
| SLV | Emtia (gümüş) | 0.50% | 32.10B | 17.25% | 0.43 | -38.39% |
| VWO | Gelişmekte olan piyasalar | 0.06% | 124.77B | 6.09% | 0.16 | -29.14% |
| URA | Tematik — enerji/uranyum | 0.69% | 6.14B | **güvenilmez** | n/a | -28.5% (5y) |

## Veri kalitesi notları

- **URA**: 5 yıllık getiri için iki kaynak birbiriyle çelişen rakamlar
  verdi (%28.84 vs %15.31) ve Sharpe için bulunan rakamlar da tutarsızdı
  (%0.41 ile %2.76 gibi). Bu yüzden Sharpe **hesaplanmadı ve sıralamaya
  dahil edilmedi** — güvenilir tek bir kaynak bulunmadan bu fon hakkında
  hüküm vermek yanıltıcı olur. Maks. drawdown 5 yıllık pencerede -28.5%,
  ama kuruluşundan bu yana (2020 zirve-dip) -93.54% gibi çok daha sert bir
  rakam da var — hangi drawdown'ın "temsili" olduğu döneme göre çok
  değişiyor, tematik/emtia-bağlantılı fonların oynaklığına dikkat.
- **QTUM**: 5 yıllık pencere (getiri 24.56%, stdev 27.61%) kullanıldı ana
  tabloda. Ayrı bir kaynakta 3 yıllık pencere için getiri %39.91,
  stdev %28.16 (Sharpe hesabıyla ~1.28) bulundu — ama bu "Investment
  Return" etiketinin kümülatif mi yıllıklandırılmış mı olduğu kaynakta
  belirsizdi, bu yüzden ana tabloya alınmadı. Fonun genç olması (nispeten
  yeni tematik ETF) nedeniyle uzun pencereli veri zaten kısıtlı.
- Diğer 7 ETF (VOO, VTI, SPY, QQQ, GLD, SLV, VWO) için rakamlar tek,
  tutarlı bir kaynaktan (lazyportfolioetf.com) geldi ve makul aralıkta —
  güven düzeyi yüksek.

## Okuma notları

- **GLD en yüksek Sharpe'a sahip** (0.80) — altın, hisse senedi
  endekslerinden daha düşük volatilite (16.37%) ile benzer/daha iyi getiri
  sağlamış bu dönemde. Emtia her zaman böyle davranmaz, bu 5 yıllık
  pencereye özgü bir gözlem.
- **QTUM yüksek Sharpe (0.75) ama en derin drawdown'lardan birine sahip**
  (-34.79%) — yüksek getiri/volatilite oranı, tek başına "düşük risk"
  anlamına gelmiyor; tematik/dar sektör fonu olarak concentration riski
  taşıyor.
- **VOO ve SPY pratik olarak aynı** (ikisi de S&P 500 takip ediyor,
  Sharpe 0.57), VOO'nun gider oranı SPY'den düşük (0.03% vs 0.09%) — aynı
  maruziyeti daha ucuza almak isteyenler için VOO öne çıkıyor.
- **VWO en düşük Sharpe'a sahip** (0.16) — gelişmekte olan piyasalar bu
  5 yıllık pencerede hem düşük getiri hem yüksek drawdown (-29.14%) ile
  zayıf risk-ayarlı performans göstermiş.
