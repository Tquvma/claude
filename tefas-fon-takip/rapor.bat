@echo off
rem Cift tikla: guncel veriyle rapor.html uretir ve tarayicida acar.
rem Ek secenek gerekirse: rapor.bat --onbellek  (aga cikmadan son veriyle)
cd /d "%~dp0"
if not exist venv\Scripts\python.exe (
  echo venv bulunamadi. Once kurulum yapin:
  echo   python -m venv venv
  echo   venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)
venv\Scripts\python.exe rapor_html.py --ac %*
if errorlevel 1 pause
