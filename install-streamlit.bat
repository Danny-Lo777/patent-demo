@echo off
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -m pip install -r requirements-streamlit.txt
) else (
  python -m pip install -r requirements-streamlit.txt
)
