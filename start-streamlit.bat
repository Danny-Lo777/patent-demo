@echo off
set STREAMLIT_BROWSER_GATHER_USAGE_STATS=false
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -m streamlit run streamlit_app.py --server.port 8501 --server.address 0.0.0.0 --server.headless true
) else (
  python -m streamlit run streamlit_app.py --server.port 8501 --server.address 0.0.0.0 --server.headless true
)
