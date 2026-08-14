"""
KAP Aylık Rapor - v2
Fonların KAP'ta yayımlanan aylık portföy dağılım raporlarından
hisse bazlı ilk 10 pozisyonu çıkarır.

Kullanım:
    # Elle indirilmiş rapor dosyasını çözümle (güvenilir yol):
    python kap_rapor.py --dosya PHE_aylik_rapor.xlsx --fon PHE

    # KAP'tan son raporu indirmeyi dene (deneysel; site yapısı değişirse kırılabilir):
    python kap_rapor.py --fon PHE

Rapor dosyasını elle indirmek için: kap.org.tr -> fonu ara ->
"Bildirimler" -> "Portföy Dağılım Raporu" (aylık) -> eki (.xlsx/.xls) kaydet.
"""

import argparse
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

# Hisse bölümünü başlatan başlıklar (büyük harfe çevrilmiş, Türkçe İ->I normalize)
HISSE_BASLIKLAR = ("HISSE SENED", "PAY SENED", "ORTAKLIK PAY")
# Hisse bölümünü bitiren diğer varlık sınıfı başlıkları
BOLUM_SONU = ("TAHVIL", "BONO", "SUKUK", "KIRA SERTIFIKA", "MEVDUAT", "REPO",
              "KATILMA", "FON KATILMA", "VADELI", "DOVIZ", "ALTIN",
              "KIYMETLI", "TOPLAM", "DIGER")


def _normalize(metin: str) -> str:
    """Türkçe karakterleri sadeleştirip büyük harfe çevirir (karşılaştırma için)."""
    tablo = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    return metin.translate(tablo).upper()


def _sayi(deger) -> float | None:
    """'12,34', '12.34', 12.34 gibi değerleri float'a çevirir; olmazsa None."""
    if deger is None:
        return None
    if isinstance(deger, (int, float)):
        f = float(deger)
        return f if not pd.isna(f) else None
    s = str(deger).strip().replace("%", "")
    if not s:
        return None
    # Türkçe biçim: binlik '.' + ondalık ','
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def hisseleri_ayikla(dosya: str) -> list[tuple[str, float]]:
    """Rapor dosyasındaki hisse bölümünü bulur, (isim, oran%) listesi döndürür.

    Excel'in tüm sayfalarını satır satır tarar: hisse başlığından sonraki
    satırları toplar, başka bir varlık sınıfı başlığında durur. Oran olarak
    satırdaki 0-100 arası son sayısal hücre alınır.
    """
    sayfalar = pd.read_excel(dosya, sheet_name=None, header=None)
    pozisyonlar: list[tuple[str, float]] = []

    for sayfa in sayfalar.values():
        icinde = False
        for _, satir in sayfa.iterrows():
            hucreler = [h for h in satir.tolist() if h is not None and not (
                isinstance(h, float) and pd.isna(h))]
            if not hucreler:
                continue
            metinler = [_normalize(str(h)) for h in hucreler if isinstance(h, str)]
            birlesik = " ".join(metinler)

            if not icinde:
                if any(b in birlesik for b in HISSE_BASLIKLAR):
                    icinde = True
                continue

            # Bölüm sonu mu? (yeni varlık sınıfı başlığı ya da toplam satırı)
            if metinler and any(b in birlesik for b in BOLUM_SONU):
                icinde = False
                continue

            isim = next((str(h).strip() for h in hucreler if isinstance(h, str)
                         and str(h).strip()), None)
            sayilar = [s for s in (_sayi(h) for h in hucreler)
                       if s is not None and 0 < s <= 100]
            if isim and sayilar:
                pozisyonlar.append((isim, sayilar[-1]))

    # Aynı isim birden çok sayfada geçtiyse en yükseğini tut
    tekil: dict[str, float] = {}
    for isim, oran in pozisyonlar:
        tekil[isim] = max(oran, tekil.get(isim, 0.0))
    return sorted(tekil.items(), key=lambda x: -x[1])


def kap_indir(fon_kodu: str) -> str | None:
    """KAP'tan fonun son aylık portföy dağılım raporunu indirmeyi dener.

    DENEYSEL: KAP'ın halka açık arama API'sini kullanır; site yapısı
    değişirse çalışmayabilir. Başarısızsa None döner (raporu elle indirip
    --dosya ile vermek her zaman mümkündür).
    """
    import requests

    bugun = date.today()
    baslangic = bugun - timedelta(days=45)  # aylık rapor için ~1,5 ay yeterli
    try:
        cevap = requests.post(
            "https://www.kap.org.tr/tr/api/memberDisclosureQuery",
            json={
                "fromDate": str(baslangic), "toDate": str(bugun),
                "memberTypes": ["FON"], "disclosureClass": "FR",
                "subjectList": [], "mkkMemberOidList": [],
                "inactiveMemberOidList": [], "bdkMemberOidList": [],
                "year": "", "term": "", "ruleType": "", "index": "", "market": "",
            },
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=30,
        )
        cevap.raise_for_status()
        bildirimler = cevap.json()
    except Exception as e:
        print(f"[!] KAP sorgusu başarısız: {e}")
        return None

    norm_kod = _normalize(fon_kodu)
    for b in bildirimler:
        baslik = _normalize(str(b.get("kapTitle", "")) + " " + str(b.get("title", "")))
        konu = _normalize(str(b.get("subject", "")))
        if norm_kod in baslik and "PORTFOY DAGILIM" in konu:
            bildirim_no = b.get("disclosureIndex") or b.get("basic", {}).get("disclosureIndex")
            if not bildirim_no:
                continue
            try:
                ek = requests.get(
                    f"https://www.kap.org.tr/tr/api/disclosure/attachment/{bildirim_no}",
                    headers={"User-Agent": "Mozilla/5.0"}, timeout=60,
                )
                ek.raise_for_status()
            except Exception as e:
                print(f"[!] Ek indirilemedi: {e}")
                return None
            hedef = Path(tempfile.gettempdir()) / f"kap_{fon_kodu}_{bildirim_no}.xlsx"
            hedef.write_bytes(ek.content)
            return str(hedef)

    print(f"[!] {fon_kodu} için son 45 günde portföy dağılım raporu bulunamadı.")
    return None


def main() -> None:
    p = argparse.ArgumentParser(description="KAP aylık rapordan ilk 10 hisse pozisyonu")
    p.add_argument("--fon", required=True, help="Fon kodu (ör. PHE)")
    p.add_argument("--dosya", help="Elle indirilmiş KAP rapor dosyası (.xlsx/.xls)")
    p.add_argument("--adet", type=int, default=10, help="Kaç pozisyon gösterilsin (vars. 10)")
    args = p.parse_args()

    dosya = args.dosya
    if not dosya:
        print(f"[i] {args.fon}: KAP'tan son rapor indirilmeye çalışılıyor (deneysel)...")
        dosya = kap_indir(args.fon)
        if not dosya:
            print("    Raporu kap.org.tr'den elle indirip --dosya ile verebilirsin.")
            sys.exit(1)

    pozisyonlar = hisseleri_ayikla(dosya)
    if not pozisyonlar:
        print(f"[!] {dosya}: hisse bölümü bulunamadı. Dosya portföy dağılım raporu mu?")
        sys.exit(1)

    print("=" * 60)
    print(f"{args.fon} - ilk {min(args.adet, len(pozisyonlar))} hisse pozisyonu ({dosya})")
    print("=" * 60)
    for i, (isim, oran) in enumerate(pozisyonlar[:args.adet], 1):
        print(f"{i:>2}. {isim:<40} {oran:>6.2f}%")
    toplam = sum(o for _, o in pozisyonlar[:args.adet])
    print("-" * 60)
    print(f"    {'İlk ' + str(min(args.adet, len(pozisyonlar))) + ' toplamı':<40} {toplam:>6.2f}%")


if __name__ == "__main__":
    main()
