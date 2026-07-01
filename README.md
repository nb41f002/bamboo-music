# 竹簡樂府 — 部署包

文言文歌曲播放網頁。此資料夾為可直接部署的靜態網站。

## 部署到 GitHub Pages

1. 建立一個新的 GitHub repository。
2. 把本資料夾內**所有檔案與子資料夾**（保持結構）放到 repo 根目錄後 push。
3. repo → **Settings → Pages → Build and deployment → Source** 選 **Deploy from a branch**，Branch 選 `main` / `/ (root)`，Save。
4. 等一兩分鐘，開 `https://<你的帳號>.github.io/<repo 名稱>/` 即可。

## ⚠ 重要

- **一定要透過網頁伺服器開啟**（GitHub Pages 就是）。直接用滑鼠雙擊 `index.html`（`file://`）會因瀏覽器安全限制而載入失敗，這是正常現象，不是壞掉。
  - 想在本機預覽：在此資料夾執行 `python -m http.server` 再開 `http://localhost:8000/`。
- 需要連網：3D 竹簡用到 three.js（CDN）、中文字型用到 Google Fonts。

## 檔案結構

| 檔案 | 用途 |
|---|---|
| `index.html` | 入口頁 |
| `SiteFrame.dc.html` | 主程式（畫面與互動） |
| `support.js` | 執行環境（請勿改動） |
| `songs.js` | 歌曲、歌詞、時間軸 |
| `notes.js` | 研讀註釋（注音・字義） |
| `images/` | 背景圖（bg00–bg09） |
| `audio/` | 音檔 |
| `fonts/` | 匯文楷體字型 |

## 更新歌曲

- 換音檔：覆蓋 `audio/` 內對應的檔案即可（檔名對照見 `songs.js` 各首的 `audio` 欄位）。
- 調整歌詞時間軸：改 `songs.js` 中該首 `lines` 陣列每行的 `time`（單位：秒）。
- 增修註釋：改 `notes.js`（`key` = 歌曲 id，`l` = 該首歌詞的行索引）。
