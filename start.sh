#!/bin/bash
PORT=${1:-8080}
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "========================================================"
echo "  한자 사전 PWA 웹앱 서버 실행 중..."
echo "========================================================"
echo "  * Mac 브라우저 접속:    http://localhost:$PORT"
echo "  * iPhone/iPad 접속 (동일 Wi-Fi): http://$LOCAL_IP:$PORT"
echo "========================================================"
echo "종료하려면 Ctrl+C를 누르세요."

cd "$(dirname "$0")"
python3 -m http.server $PORT
