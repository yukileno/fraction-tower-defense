@echo off
chcp 65001 > nul
echo ======================================================
echo   分数まどうタワーディフェンス 〜すうじの王国をまもれ！〜
echo   （小学校5年生対象: 分数の足し算・引き算・通分）
echo ======================================================
echo.
echo ブラウザでゲームを起動しています...
start "" "http://localhost:8080/index.html"
echo.
echo もしブラウザが開かない場合は、ブラウザで以下のURLを開いてください:
echo http://localhost:8080/index.html
echo.
echo サーバーを停止したい場合は、このウィンドウを閉じてください。
python -m http.server 8080
