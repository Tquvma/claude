"""
Drift Raporu - v3
Hedef dağılım (ayarlar.HEDEFLER) ile gerçekleşen dağılımı karşılaştırır,
eşiği (ayarlar.DRIFT_ESIK) aşan sapmaları işaretler ve aylık rapor üretir.

Kullanım:
    python drift_rapor.py           # TEFAS'tan güncel fiyatlarla
    python drift_rapor.py --demo    # ağ gerektirmeden örnek verilerle

Gerçek kullanım için ayarlar.py'de PORTFOY (adetler), NAKIT_TL ve
HEDEFLER'i kendi planına göre doldur.
"""

import argparse
import sys
from datetime import date
from pathlib import Path

from ayarlar import DRIFT_ESIK, HEDEFLER, NAKIT_TL, PORTFOY

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# --demo çıktısının ağ olmadan görülebilmesi için örnek veriler
DEMO_PORTFOY = {"YAY": 1200, "YBE": 900, "PHE": 350, "AFA": 800,
                "AES": 600, "TP2": 400, "YFAY1": 500}
DEMO_NAKIT_TL = 95_000.0
DEMO_FIYATLAR = {"YAY": 28.41, "YBE": 31.07, "PHE": 52.66, "AFA": 19.83,
                 "AES": 24.12, "TP2": 41.55, "YFAY1": 17.29}


def degerleri_hesapla(portfoy: dict, fiyatlar: dict, nakit_tl: float) -> dict:
    """Fon kodu -> TL değeri. 'NAKIT' özel anahtarı nakdi temsil eder."""
    degerler = {}
    for kod, adet in portfoy.items():
        if adet <= 0:
            continue
        if kod not in fiyatlar:
            print(f"[!] {kod}: fiyat alınamadı, drift hesabına katılamıyor")
            continue
        degerler[kod] = adet * fiyatlar[kod]
    if nakit_tl > 0:
        degerler["NAKIT"] = nakit_tl
    return degerler


def drift_hesapla(degerler: dict, hedefler: dict) -> tuple[list[dict], float]:
    """Grup bazında (hedef %, gerçek %, sapma) satırları ve toplam değeri döndürür."""
    toplam = sum(degerler.values())
    if toplam <= 0:
        return [], 0.0

    atanan_kodlar = set()
    satirlar = []
    for grup, tanim in hedefler.items():
        kodlar = tanim["fonlar"]
        atanan_kodlar.update(kodlar)
        gercek_tl = sum(degerler.get(k, 0.0) for k in kodlar)
        gercek = 100.0 * gercek_tl / toplam
        hedef = float(tanim["hedef_yuzde"])
        sapma = gercek - hedef
        satirlar.append({
            "grup": grup, "hedef": hedef, "gercek": gercek, "sapma": sapma,
            "gercek_tl": gercek_tl,
            # eşik aşıldıysa hedefe dönmek için gereken alım(+)/satım(-) tutarı
            "duzeltme_tl": (hedef - gercek) / 100.0 * toplam,
            "asildi": abs(sapma) > DRIFT_ESIK,
        })

    # Hedeflerde hiç geçmeyen ama portföyde olan kodlar
    disarida = {k: v for k, v in degerler.items() if k not in atanan_kodlar}
    if disarida:
        gercek_tl = sum(disarida.values())
        satirlar.append({
            "grup": "(hedefsiz: " + ", ".join(sorted(disarida)) + ")",
            "hedef": 0.0, "gercek": 100.0 * gercek_tl / toplam,
            "sapma": 100.0 * gercek_tl / toplam, "gercek_tl": gercek_tl,
            "duzeltme_tl": -gercek_tl,
            "asildi": 100.0 * gercek_tl / toplam > DRIFT_ESIK,
        })
    return satirlar, toplam


def tl(v: float) -> str:
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " TL"


def raporu_yazdir(satirlar: list[dict], toplam: float, kaynak: str) -> list[str]:
    """Raporu ekrana basar ve markdown satırlarını döndürür."""
    donem = date.today().strftime("%Y-%m")
    baslik = f"AYLIK DRIFT RAPORU - {donem} ({kaynak})"
    md = [f"# {baslik}", "", f"Toplam portföy değeri: **{tl(toplam)}**",
          f"Sapma eşiği: ±{DRIFT_ESIK:g} puan", "",
          "| Grup | Hedef % | Gerçek % | Sapma | Durum | Öneri |",
          "|---|---:|---:|---:|---|---|"]

    print("=" * 78)
    print(baslik)
    print(f"Toplam portföy değeri: {tl(toplam)}   Eşik: ±{DRIFT_ESIK:g} puan")
    print("-" * 78)
    print(f"{'Grup':<28} {'Hedef%':>7} {'Gerçek%':>8} {'Sapma':>7}  Durum")
    print("-" * 78)
    for s in satirlar:
        durum = "⚠ EŞİK AŞILDI" if s["asildi"] else "OK"
        oneri = ""
        if s["asildi"]:
            yon = "al" if s["duzeltme_tl"] > 0 else "sat"
            oneri = f"{tl(abs(s['duzeltme_tl']))} {yon}"
        print(f"{s['grup']:<28} {s['hedef']:>7.1f} {s['gercek']:>8.1f} "
              f"{s['sapma']:>+7.1f}  {durum}" + (f"  → {oneri}" if oneri else ""))
        md.append(f"| {s['grup']} | {s['hedef']:.1f} | {s['gercek']:.1f} | "
                  f"{s['sapma']:+.1f} | {durum} | {oneri or '—'} |")

    hedef_toplam = sum(s["hedef"] for s in satirlar)
    if abs(hedef_toplam - 100.0) > 0.01:
        uyari = f"[!] Hedef yüzdeler toplamı {hedef_toplam:g}, 100 olmalı — ayarlar.py'yi kontrol et."
        print("-" * 78)
        print(uyari)
        md += ["", f"> {uyari}"]
    print("=" * 78)
    return md


def main() -> None:
    p = argparse.ArgumentParser(description="Hedef vs gerçekleşen dağılım drift raporu")
    p.add_argument("--demo", action="store_true",
                   help="Ağ gerektirmeden örnek portföy ve fiyatlarla çalıştır")
    p.add_argument("--kaydet", action="store_true",
                   help="Raporu drift_rapor_YYYY-AA.md olarak kaydet")
    args = p.parse_args()

    if args.demo:
        fiyatlar = DEMO_FIYATLAR
        portfoy, nakit = DEMO_PORTFOY, DEMO_NAKIT_TL
        kaynak = "DEMO verisi"
    else:
        portfoy, nakit = PORTFOY, NAKIT_TL
        if not any(a > 0 for a in portfoy.values()) and nakit <= 0:
            print("ayarlar.py'de PORTFOY adetleri boş. Önce kendi adetlerini gir,\n"
                  "ya da çıktıyı görmek için: python drift_rapor.py --demo")
            return
        from fon_takip import verileri_cek
        data = verileri_cek(fonlar=[k for k, a in portfoy.items() if a > 0])
        if data is None:
            print("Fiyatlar çekilemedi; internet bağlantısını kontrol et.")
            return
        fiyatlar = dict(zip(data["code"], data["price"].astype(float)))
        kaynak = "TEFAS " + str(data["date"].max())

    degerler = degerleri_hesapla(portfoy, fiyatlar, nakit)
    satirlar, toplam = drift_hesapla(degerler, HEDEFLER)
    if not satirlar:
        print("Hesaplanacak pozisyon yok.")
        return

    md = raporu_yazdir(satirlar, toplam, kaynak)
    if args.kaydet:
        yol = Path(__file__).parent / f"drift_rapor_{date.today().strftime('%Y-%m')}.md"
        yol.write_text("\n".join(md) + "\n", encoding="utf-8")
        print(f"Rapor kaydedildi: {yol}")


if __name__ == "__main__":
    main()
