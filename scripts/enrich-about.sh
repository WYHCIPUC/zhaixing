#!/bin/bash
# About 丰富收尾：topics / tag / release / 资产上传（curl 实现，规避 node PATCH 问题）
set -e
cd "$(dirname "$0")/.."

TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep "^password=" | cut -d= -f2)
API="https://api.github.com/repos/WYHCIPUC/zhaixing"
AUTH="Authorization: Bearer $TOKEN"

# 1. Topics
node -e "require('fs').writeFileSync('topics.tmp.json', JSON.stringify({names:['electron','react','typescript','sqlite','weread','reading-notes','note-taking','knowledge-management','ai','local-first','data-visualization','d3-force','framer-motion']}))"
CODE=$(curl -s --max-time 30 -X PUT "$API/topics" -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/vnd.github+json" --data-binary @topics.tmp.json -o topics-res.json -w "%{http_code}")
echo "topics: HTTP $CODE"
node -e "const j=require('./topics-res.json'); console.log('  →', (j.names||[]).join(', '))"

# 2. tag v0.1.0 → main
MAIN_SHA=$(curl -s --max-time 30 "$API/git/refs/heads/main" -H "$AUTH" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).object.sha))")
node -e "require('fs').writeFileSync('tag.tmp.json', JSON.stringify({ref:'refs/tags/v0.1.0', sha:'$MAIN_SHA'}))"
CODE=$(curl -s --max-time 30 -X POST "$API/git/refs" -H "$AUTH" -H "Content-Type: application/json" --data-binary @tag.tmp.json -o tag-res.json -w "%{http_code}")
[ "$CODE" = "201" ] && echo "tag: created → $MAIN_SHA" || { echo "tag: HTTP $CODE"; cat tag-res.json | head -c 150; echo; }

# 3. Release（不存在才创建）
RELEASE_ID=$(curl -s --max-time 30 "$API/releases" -H "$AUTH" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const list=JSON.parse(s); const r=list.find(x=>x.tag_name==='v0.1.0');
  console.log(r? r.id : 'NONE');
})")
if [ "$RELEASE_ID" = "NONE" ]; then
  node -e "
const fs=require('fs');
fs.writeFileSync('release.tmp.json', JSON.stringify({
  tag_name:'v0.1.0', target_commitish:'main',
  name:'v0.1.0 · 摘星实录 首个公开版本',
  body:['首个公开版本 ✦','','## 下载','','下载下方 \`Zhaixing-Setup-0.1.0.exe\`，双击安装即可（Windows 10+，数据全部存本机）。','','## 亮点','','- **微信读书一键同步**：划线 / 想法 / 评分 / 书评自动入库，幂等去重','- **星穹图谱**：AI 星云聚类 · 共创连线 · 双星对话 · 观点对撞 · 镇星之宝','- **重逢式回顾**：流星日报 · 时间胶囊 · 夜航模式（无打卡无闪卡）','- **织星成文**：星云素材 AI 起草随笔，与星空对话（RAG 问答）','- **星光节**：热力图 · 精神光谱 · 年度星空回放 · 金句分享卡片','','## 说明','','- AI 功能需在设置中配置 OpenAI 兼容接口（GLM / DeepSeek / OpenAI 均可）','- 微信读书同步需配置 weread-skills 网关 API Key','- 从源码构建：\`npm install && npm run dist\`'].join('\n'),
  draft:false, prerelease:false}));
"
  CODE=$(curl -s --max-time 30 -X POST "$API/releases" -H "$AUTH" -H "Content-Type: application/json" --data-binary @release.tmp.json -o release-res.json -w "%{http_code}")
  echo "release: HTTP $CODE"
  RELEASE_ID=$(node -e "const j=require('./release-res.json'); console.log(j.id||'ERR '+JSON.stringify(j).slice(0,150))")
fi
echo "release id: $RELEASE_ID"

# 4. 上传安装包资产（若未上传）
ASSET_UP=$(curl -s --max-time 30 "$API/releases/$RELEASE_ID/assets" -H "$AUTH" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const l=JSON.parse(s);const a=l.find(x=>x.name==='Zhaixing-Setup-0.1.0.exe');console.log(a?'YES':'NO')})")
if [ "$ASSET_UP" = "YES" ]; then
  echo "资产已存在，跳过上传"
else
  echo "上传安装包（107MB，可能需要几分钟）…"
  CODE=$(curl -s --max-time 1800 -X POST \
    "https://uploads.github.com/repos/WYHCIPUC/zhaixing/releases/$RELEASE_ID/assets?name=Zhaixing-Setup-0.1.0.exe" \
    -H "$AUTH" -H "Content-Type: application/octet-stream" \
    --data-binary @"dist/Zhaixing-Setup-0.1.0.exe" -o asset-res.json -w "%{http_code}")
  echo "资产上传: HTTP $CODE"
  [ "$CODE" = "201" ] && node -e "const j=require('./asset-res.json'); console.log('  ✓', j.name, j.state, (j.size/1024/1024).toFixed(1)+'MB')"
fi

# 清理临时文件
rm -f topics.tmp.json topics-res.json tag.tmp.json tag-res.json release.tmp.json release-res.json asset-res.json patch.tmp.json patch-res.json
echo "=== 完成 ==="
