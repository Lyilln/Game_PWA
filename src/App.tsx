import React, { useEffect, useMemo, useState } from "react";
import { listSaves, createSave, loadSave, makeEmptyPlayer, appendLog, listLogs, type SaveRow, type LogRow } from "./db";
import { generateWindLines } from "./engine";

type Mode = "cover" | "setup" | "play";

export default function App() {
  const [mode, setMode] = useState<Mode>("cover");
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [curSave, setCurSave] = useState<SaveRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const canContinue = useMemo(() => saves.length > 0, [saves]);

  async function refreshSaves() {
    const all = await listSaves();
    setSaves(all);
  }

  async function openSave(saveId: string, goPlay = true) {
    const s = await loadSave(saveId);
    if (!s) return;
    setCurSave(s);
    const l = await listLogs(saveId, 60);
    setLogs(l);
    if (goPlay) setMode("play");
  }

  useEffect(() => {
    refreshSaves();
  }, []);

  async function onContinue() {
    if (!saves[0]) return;
    await openSave(saves[0].saveId, true);
  }

  function onNew() {
    setMode("setup");
  }

  async function onLoadMostRecent() {
    if (!saves[0]) return;
    await openSave(saves[0].saveId, true);
  }

  // 暫時：快速開一個可跑的存檔（下一步做你完整 Setup 表格）
  async function quickStart() {
    const p = makeEmptyPlayer();
    p.name = "（未命名）";
    p.codename = "（代號）";
    p.nickname = "";
    p.age = null;
    p.talent = "";
    p.ability = "";
    p.personalityTags = [];
    p.principles = [];
    p.identity = "未知身分（系統將更新）";
    p.currentPersonalityTilt = "尚未形成（系統將更新）";
    p.publicOpinion = "尚無風評（系統將更新）";

    const save = await createSave("存檔" + (saves.length + 1), p);
    await refreshSaves();

    await appendLog(save.saveId, "narrative", "Day 1：你醒來時，世界像被冷色的灰塵覆蓋。");
    await appendLog(save.saveId, "wind", generateWindLines().join("\n"));

    await openSave(save.saveId, true);
  }

  return (
    <div className="app">
      <div className="shell">
        {mode === "cover" && (
          <div className="bgStage">
            <div className="topBar">
              <div className="brand">
                <div className="brandTitle">Game_PWA</div>
                <div className="brandSub">末世戀愛生存互動式小說 · 橙光式運作 · IndexedDB 存檔</div>
              </div>
              <button className="iconBtn" aria-label="設定" title="設定（之後做抽屜）">⚙︎</button>
            </div>

            <div className="stack">
              <div className="glassCard">
                <div className="cardPad">
                  <div className="cardTitle">進入世界</div>
                  <div className="cardText">
                    你不需要選單；你只需要一句話。
                    <br />
                    每段正文後，輸入「我做了什麼」，世界會記住。
                  </div>

                  <div className="btnRow">
                    <button className="btnPill btnPillPrimary" disabled={!canContinue} onClick={onContinue}>
                      繼續
                    </button>
                    <button className="btnPill" onClick={onNew}>
                      新開始
                    </button>
                    <button className="btnPill" disabled={!canContinue} onClick={onLoadMostRecent}>
                      讀檔
                    </button>
                  </div>

                  <div className="miniBadgeRow">
                    <span className="badge">自然語言為主</span>
                    <span className="badge">可選指令</span>
                    <span className="badge">4–7 段關鍵時刻</span>
                    <span className="badge">關係混合制</span>
                  </div>

                  <div className="darkInfo">
                    <b>提示：</b>你後面要做海后/後宮，多存檔會是核心玩法。<br />
                    （下一步我們做「檔案櫃抽屜」）
                  </div>
                </div>
              </div>

              <div className="glassCard">
                <div className="cardPad">
                  <div className="cardTitle">快速測試（臨時）</div>
                  <div className="cardText">
                    這顆只為了讓你現在立刻看到 Play 畫面能跑。
                    <br />
                    下一步我們會把它換成你完整的主控建立表格（1–6 區塊）。
                  </div>

                  <div className="btnRow">
                    <button className="btnPill btnPillPrimary" onClick={quickStart}>
                      立即進入（測試）
                    </button>
                    <button className="btnPill" onClick={() => alert("下一步：做主控建立 Setup UI")}>
                      我知道了
                    </button>
                  </div>

                  <div className="miniBadgeRow">
                    <span className="badge">異能世界觀</span>
                    <span className="badge">男主庫不劇透</span>
                    <span className="badge">勢力池 1/2/3/4/6</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "setup" && (
          <div className="bgStage">
            <div className="topBar">
              <div className="brand">
                <div className="brandTitle">主控建立</div>
                <div className="brandSub">下一步會把 1–6 區塊表格完整做出來（同頁、不分頁）</div>
              </div>
              <button className="iconBtn" aria-label="返回" title="返回" onClick={() => setMode("cover")}>←</button>
            </div>

            <div className="glassCard">
              <div className="cardPad">
                <div className="cardTitle">下一步施工中</div>
                <div className="cardText">
                  我們會照你已定欄位做成「表格卡」：基礎信息／性格／數值面板／關係／名聲／成就。
                  <br />
                  B 半手填：你填關鍵欄，其它可按「幫我生成（不劇透）」。
                </div>

                <div className="btnRow">
                  <button className="btnPill btnPillPrimary" onClick={quickStart}>先進去看 Play（臨時）</button>
                  <button className="btnPill" onClick={() => setMode("cover")}>回封面</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "play" && (
          <div className="bgStage">
            <div className="topBar">
              <div className="brand">
                <div className="brandTitle">Play（暫時）</div>
                <div className="brandSub">下一步做：正文卡＋風向卡＋底部輸入列＋人物圓形列（像圖 6）</div>
              </div>
              <button className="iconBtn" aria-label="回封面" title="回封面" onClick={() => setMode("cover")}>⌂</button>
            </div>

            <div className="glassCard">
              <div className="cardPad">
                <div className="cardTitle">目前存檔</div>
                <div className="cardText">
                  {curSave ? `存檔：${curSave.title}｜段落：${curSave.progress.segment}` : "尚未載入"}
                </div>

                <div className="darkInfo">
                  你現在看到的是「Cover 玻璃系統」已套進 Play 容器。<br />
                  下一步才會把 Play 做成：上方 HUD＋正文霧玻璃卡＋世界風向 3 行＋底部輸入＋底部人物圓形列。
                </div>

                <div className="btnRow">
                  <button className="btnPill" onClick={() => setMode("cover")}>回封面</button>
                </div>
              </div>
            </div>

            {logs.length > 0 && (
              <div className="glassCard" style={{ marginTop: 14 }}>
                <div className="cardPad">
                  <div className="cardTitle">最近日誌（預覽）</div>
                  <div className="cardText" style={{ whiteSpace: "pre-wrap" }}>
                    {logs.slice(-6).map((l) => `• [${l.kind}] ${l.text}`).join("\n\n")}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}