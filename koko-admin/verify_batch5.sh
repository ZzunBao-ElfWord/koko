#!/bin/bash
# 临时验证脚本：第五批接口验收（用完即删，含密码不得留存）
set -e
TOKEN=$(curl -s -X POST http://localhost:8093/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"d634e7002149cb453041f8a60024dbf1"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
echo "login_ok_len=${#TOKEN}"

echo "=== 1. 全站搜索 q=test 近90天 ==="
curl -s "http://localhost:8093/api/v1/messages/search?q=test&days=90" -H "Authorization: Bearer $TOKEN" | head -c 700
echo ""
echo "=== 2. 短关键字应 400 ==="
curl -s -o /dev/null -w "http_status=%{http_code}\n" "http://localhost:8093/api/v1/messages/search?q=a" -H "Authorization: Bearer $TOKEN"
echo "=== 3. 无匹配关键字 ==="
curl -s "http://localhost:8093/api/v1/messages/search?q=zzqqxx123&days=90" -H "Authorization: Bearer $TOKEN" | head -c 150
echo ""

echo "=== 4. 冻结/解冻往返（选列表最后一名用户，记录原状后还原） ==="
USERID=$(curl -s "http://localhost:8093/api/v1/users?page=1&page_size=20" -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | tail -1 | sed 's/"id":"\([^"]*\)"/\1/')
echo "target_user=$USERID"
BEFORE=$(docker exec stoat-database-1 mongosh --quiet revolt --eval "printjson(db.accounts.findOne({_id:'$USERID'},{disabled:1}))" | tr -d '\n ')
echo "before=$BEFORE"
SES_BEFORE=$(docker exec stoat-database-1 mongosh --quiet revolt --eval "print(db.sessions.countDocuments({user_id:'$USERID'}))" | tr -d '\n ')
echo "sessions_before=$SES_BEFORE"
echo "-- freeze --"
curl -s -X POST "http://localhost:8093/api/v1/users/$USERID/freeze" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"frozen":true}'
echo ""
AFTER=$(docker exec stoat-database-1 mongosh --quiet revolt --eval "printjson(db.accounts.findOne({_id:'$USERID'},{disabled:1}))" | tr -d '\n ')
echo "after_freeze=$AFTER"
SES_AFTER=$(docker exec stoat-database-1 mongosh --quiet revolt --eval "print(db.sessions.countDocuments({user_id:'$USERID'}))" | tr -d '\n ')
echo "sessions_after=$SES_AFTER"
echo "-- 用户列表 disabled 标识 --"
curl -s "http://localhost:8093/api/v1/users?page=1&page_size=20" -H "Authorization: Bearer $TOKEN" | grep -o "\"id\":\"$USERID\"[^}]*" | head -c 200
echo ""
echo "-- unfreeze --"
curl -s -X POST "http://localhost:8093/api/v1/users/$USERID/freeze" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"frozen":false}'
echo ""
RESTORED=$(docker exec stoat-database-1 mongosh --quiet revolt --eval "printjson(db.accounts.findOne({_id:'$USERID'},{disabled:1}))" | tr -d '\n ')
echo "after_unfreeze=$RESTORED"

echo "=== 5. 用户 CSV（前3行，验证 BOM+表头） ==="
curl -s "http://localhost:8093/api/v1/users/export.csv" -H "Authorization: Bearer $TOKEN" | head -3
echo "=== 6. 审计 CSV（前2行） ==="
curl -s "http://localhost:8093/api/v1/audit/export.csv?method=POST" -H "Authorization: Bearer $TOKEN" | head -2
echo "=== 7. 未授权应 401 ==="
curl -s -o /dev/null -w "http_status=%{http_code}\n" "http://localhost:8093/api/v1/messages/search?q=test"
