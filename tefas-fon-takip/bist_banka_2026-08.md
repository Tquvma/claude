# BIST BANKA TARAMA RAPORU - 2026-08

Bankalar için F/K ve net nakit anlamsız (mevduat/kredi kalemleri farklı bir
bilanço mantığına sahip) — bu yüzden `bist_tarama.py`'nin yönteminden ayrı,
banka-özel bir çerçeve kullanıldı.

**Kaynak**: isyatirim.com.tr `MaliTablo` uç noktası, `financialGroup=UFRS_K`
(konsolide, TFRS bankacılık formatı) — `bist_tarama.py`'nin kullandığı
`XI_29` (banka dışı şirket) formatından farklı bir parametre.

**Dönem**: 2025 tam yıl (son tamamlanmış mali yıl, `2O`/`2OV` kalemleri
Aralık dönemi kümülatif değerleri) + ROE için 2024 yıl sonu özkaynağı
(ortalama özkaynak hesaplamak amacıyla).

**Metodoloji**:
- **F/DD** = Piyasa değeri (güncel fiyat × ödenmiş sermaye/pay adedi) /
  Özkaynak (ana ortaklık payı, azınlık payları hariç — itemCode `2O` −
  `2OVA`)
- **ROE (özkaynak kârlılığı)** = Dönem net kârı (ana ortaklık payı,
  itemCode `2OV`) / **ortalama** özkaynak (2025 ve 2024 yıl sonu ana
  ortaklık özkaynağının ortalaması) × 100
- **Takipteki kredi oranı**: bu uç noktanın döndürdüğü özet bilançoda
  (itemCode `1AFD` — "6.2 Takipteki Krediler") dört bankada da değer `0`
  geldi. Bu gerçek bir sıfır değil — NPL/donuk alacak kırılımı bankaların
  faaliyet raporu dipnotlarında yayımlanıyor, bu özet tablo formatında yer
  almıyor. Bu yüzden kolon `n/a` olarak işaretlendi; **gerçek NPL oranı
  için bankaların BDDK/faaliyet raporu dipnotlarına bakılmalı**, burada
  uydurulmadı.

| Kod | Yıl | Fiyat | F/DD | ROE (%) | Takipteki Kredi % |
|---|---:|---:|---:|---:|---:|
| GARAN | 2025 | 132.00 | 1.25 | 28.38 | n/a |
| AKBNK | 2025 | 70.30 | 1.18 | 20.80 | n/a |
| YKBNK | 2025 | 35.62 | 1.18 | 21.00 | n/a |
| ISCTR | 2025 | 12.53 | 0.73 | 18.19 | n/a |

**Okuma notları**:
- GARAN en yüksek ROE'ye (28.4%) sahip ama aynı zamanda en yüksek F/DD'yi
  (1.25) taşıyor — piyasa bu kârlılık farkını zaten fiyatlıyor.
- ISCTR, F/DD 0.73 ile defter değerinin altında işlem görüyor; ROE (18.2%)
  diğer üçünden düşük ama yine de güçlü — potansiyel olarak görece ucuz,
  ama neden iskontolu olduğu (örn. büyüme, temettü politikası, hisse
  yapısı) ayrıca araştırılmalı, tek başına F/DD düşüklüğü "ucuz" anlamına
  gelmez.
- AKBNK ve YKBNK ROE'de birbirine çok yakın (20.8% / 21.0%) ve F/DD'de de
  neredeyse aynı (1.18) — ikisi arasında bu iki metrikle ayrışma yok.
- Dört banka da özkaynağını 2024→2025 arasında ciddi oranda büyütmüş
  (GARAN %35, AKBNK %29, ISCTR %35, YKBNK %33) — enflasyon muhasebesi ve
  kâr biriktirme etkisini ayrıştırmadan bu büyümeyi organik sermaye
  getirisi gibi okumamak gerekir.

**Sınırlamalar**: F/K ve net nakit taramasındaki kaynakla aynı, resmi
olmayan uç nokta — kırılgan olabilir. NPL verisi eksik olduğu için bu
tablo tek başına kredi kalitesi hakkında hüküm vermeye yeterli değil;
en azından NPL oranı BDDK aylık bankacılık sektörü verilerinden veya
bankaların kendi faaliyet raporlarından tamamlanmalı.
