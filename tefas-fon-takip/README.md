# TEFAS Fon Takip

Takip edilen TEFAS fonlarının son fiyatını ve varlık dağılımını çeken basit bir
komut satırı betiği. `tefas-crawler` paketini kullanır.

## Kurulum

```bash
pip install -r requirements.txt
```

## Çalıştırma

```bash
python fon_takip.py
```

`fon_takip.py` içindeki `FONLAR` listesini kendi takip ettiğin fon kodlarıyla
düzenle. Çalıştırıldığında her fon için son fiyat ve varlık dağılımı ekrana
yazdırılır; `CSV_KAYDET = True` iken sonuçlar `fon_dagilim.csv` dosyasına da
kaydedilir.
