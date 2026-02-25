import React, { useEffect, useMemo, useState } from "react";
import {
  listSaves,
  createSave,
  loadSave,
  updateSave,
  appendLog,
  listLogs,
  makeEmptyPlayer,
  type SaveRow,
  type LogRow,
  type PlayerProfile,
} from "./db";
import {
  generateWindLines,
  parseOptionalCommand,
  shouldTriggerMajorChoice,
  makeMajorChoicePrompt,
  generateNextNarrative,
} from "./engine";

type Mode = "cover" | "setup" | "play";
type SecKey = "base" | "persona" | "panel" | "relations" | "reputation" | "achievements";

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.5 3a6.5 6.5 0 0 0-5.82 9.4L3 18.08V21h2.92l1.3-1.3H9v-1.78h1.78v-1.78h1.78l1.62-1.62A6.5 6.5 0 0 0 14.5 3Zm0 2.2a4.3 4.3 0 1 1 0 8.6a4.3 4.3 0 0 1 0-8.6Zm1.2 2.1a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 0 0 0-2.2Z"
      />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("cover");
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [curSave, setCurSave] = useState<SaveRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [input, setInput] = useState("");

  const [secOpen, setSecOpen] = useState<Record<SecKey, boolean>>({
    base: true,
    persona: true,
    panel: true,
    relations: true,
    reputation: true,
    achievements: true,
  });

  // Setup 表單（B：半手填）
  const [fName, setFName] = useState("");
  const [fCodename, setFCodename] = useState("");
  const [fNickname, setFNickname] = useState("");
  const [fAge, setFAge] = useState<number | "">("");
  const [fTalent, setFTalent] = useState("");
  const [fAbility, setFAbility] = useState("");
  const [fTags, setFTags] = useState("");
  const [fPrinciples, setFPrinciples] = useState("");

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

  function toggleSec(k: SecKey) {
    setSecOpen((p) => ({ ...p, [k]: !p[k] }));
  }

  function splitTags(s: string): string[] {
    return (s || "")
      .split(/[，,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function genNoSpoil() {
    if (!fTalent.trim()) setFTalent("適應型天賦");
    // 異能允許空：代表無異能
    if (!fTags.trim()) setFTags("嘴硬心軟、護短、很會裝沒事");
    if (!fPrinciples.trim()) setFPrinciples("不欠人情、不賣隊友");
  }

  async function startLife() {
    const p = makeEmptyPlayer();

    p.name = fName.trim();
    p.codename = fCodename.trim();
    p.nickname = fNickname.trim();
    p.age = fAge === "" ? null : Number(fAge);
    p.talent = fTalent.trim();
    p.ability = fAbility.trim();

    p.personalityTags = splitTags(fTags);
    p.principles = splitTags(fPrinciples);

    // 動態欄位起點（會隨遊戲更新）
    p.identity = "未知身分（系統將更新）";
    p.currentPersonalityTilt = "尚未形成（系統將更新）";
    p.reputationTags = [];
    p.publicOpinion = "尚無風評（系統將更新）";
    p.achievements = [];

    // 展示用面板：不拉軸、不要求你現在填很細
    p.panel.overall = 10;
    p.panel.survival = 10;
    p.panel.combat = 10;
    p.panel.strategy = 10;
    p.panel.charm = 10;
    p.panel.abilityPower = p.ability ? 10 : 0;
    p.panel.stress = 0;

    const save = await createSave("存檔" + (saves.length + 1), p);
    await refreshSaves();

    await appendLog(save.saveId, "narrative", "Day 1：你醒來時，世界像被冷色的灰塵覆蓋。");
    await appendLog(save.saveId, "wind", generateWindLines().join("\n"));

    await openSave(save.saveId, true);
  }

  async function commitInput() {
    if (!curSave) return;
    const text = input.trim();
    if (!text) return;

    const parsed = parseOptionalCommand(text);
    await appendLog(curSave.saveId, "input", text, parsed);

    const updated = await updateSave(curSave.saveId, (s) => {
      const k = `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      s.world.flags[k] = { ts: Date.now(), input: text, parsed };

      s.progress.segment = (s.progress.segment || 0) + 1;
      s.world.pacing.sinceLastMajor = (s.world.pacing.sinceLastMajor || 0) + 1;
    });

    setInput("");
    setCurSave(updated);

    const seg = updated.progress.segment || 0;
    await appendLog(updated.saveId, "narrative", generateNextNarrative(seg));
    await appendLog(updated.saveId, "wind", generateWindLines().join("\n"));

    const reloaded = await loadSave(updated.saveId);
    if (reloaded && shouldTriggerMajorChoice(reloaded)) {
      const m = makeMajorChoicePrompt("C");
      await appendLog(updated.saveId, "major_choice", m.title, m);
      await updateSave(updated.saveId, (s) => {
        s.world.pacing.sinceLastMajor = 0;
      });
    }

    await openSave(updated.saveId, true);
  }

  const lastMajor = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].kind === "major_choice") return logs[i];
    }
    return null;
  }, [logs]);

  async function chooseMajor(optionText: string) {
    if (!curSave) return;
    await appendLog(curSave.saveId, "system", `你做出了選擇：${optionText}`);
    await appendLog(curSave.saveId, "narrative", "你把選擇吞下去，世界也把你記住了。");
    await appendLog(curSave.saveId, "wind", generateWindLines().join("\n"));
    await openSave(curSave.saveId, true);
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
              <button className="iconBtn" aria-label="設定" title="設定（之後做抽屜）">
                ⚙︎
              </button>
            </div>

            <div className="stack">
              <div className="glassCard">
                <div className="cardPad">
                  <div className="cardTitle">進入世界</div>
                  <div className="cardText">
                    每段正文後，輸入「我做了什麼」，世界會記住。<br />
                    自然語言為主；可選指令用來提高解析準度（不強迫）。
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
                    <span className="badge">異能世界觀</span>
                  </div>
                </div>
              </div>

              <div className="glassCard">
                <div className="cardPad">
                  <div className="cardTitle">小提醒</div>
                  <div className="cardText">
                    你要後宮/海后，多存檔會是核心玩法。<br />
                    我們之後會做「檔案櫃抽屜」：複製存檔、命名、刪除。
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
                <div className="brandSub">同頁、不分頁｜區塊可收合｜預設全展開｜B：半手填</div>
              </div>
              <button className="iconBtn" aria-label="返回" title="返回" onClick={() => setMode("cover")}>
                ←
              </button>
            </div>

            {/* ① 基礎信息 */}
            <div className="sec">
              <div className="secHead">
                <div className="secTitle">① 基礎信息</div>
                <div className="secRight">
                  <span className="secHint">{secOpen.base ? "展開" : "收合"}</span>
                  <button className="keyBtn" onClick={() => toggleSec("base")} aria-label="切換展開收合">
                    <KeyIcon />
                  </button>
                </div>
              </div>
              {secOpen.base && (
                <div className="secBody">
                  <div className="kv2">
                    <label>名字</label>
                    <input value={fName} onChange={(e) => setFName(e.target.value)} />
                  </div>
                  <div className="kv2">
                    <label>代號/顯示名</label>
                    <input value={fCodename} onChange={(e) => setFCodename(e.target.value)} />
                  </div>
                  <div className="kv2">
                    <label>暱稱</label>
                    <input value={fNickname} onChange={(e) => setFNickname(e.target.value)} />
                  </div>
                  <div className="kv2">
                    <label>年齡</label>
                    <input
                      type="number"
                      value={fAge}
                      onChange={(e) => setFAge(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                  <div className="kv2">
                    <label>性別</label>
                    <div className="pillDyn">女（鎖定）</div>
                  </div>
                  <div className="kv2">
                    <label>身分（動態更新）</label>
                    <div className="pillDyn">未知身分（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>天賦</label>
                    <input value={fTalent} onChange={(e) => setFTalent(e.target.value)} />
                  </div>
                  <div className="kv2">
                    <label>異能（可空）</label>
                    <input value={fAbility} onChange={(e) => setFAbility(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* ② 性格 */}
            <div className="sec">
              <div className="secHead">
                <div className="secTitle">② 性格</div>
                <div className="secRight">
                  <span className="secHint">{secOpen.persona ? "展開" : "收合"}</span>
                  <button className="keyBtn" onClick={() => toggleSec("persona")} aria-label="切換展開收合">
                    <KeyIcon />
                  </button>
                </div>
              </div>
              {secOpen.persona && (
                <div className="secBody">
                  <div className="kv2">
                    <label>性格（標籤/自寫）</label>
                    <input
                      placeholder="用逗號分隔，例如：嘴硬心軟、護短"
                      value={fTags}
                      onChange={(e) => setFTags(e.target.value)}
                    />
                  </div>
                  <div className="kv2">
                    <label>原則/底線</label>
                    <input
                      placeholder="用逗號分隔，例如：不欠人情、不賣隊友"
                      value={fPrinciples}
                      onChange={(e) => setFPrinciples(e.target.value)}
                    />
                  </div>
                  <div className="kv2">
                    <label>當前性格偏向（動態更新）</label>
                    <div className="pillDyn">尚未形成（遊戲將更新）</div>
                  </div>
                </div>
              )}
            </div>

            {/* ③ 個人數值面板 */}
            <div className="sec">
              <div className="secHead">
                <div className="secTitle">③ 個人數值面板</div>
                <div className="secRight">
                  <span className="secHint">{secOpen.panel ? "展開" : "收合"}</span>
                  <button className="keyBtn" onClick={() => toggleSec("panel")} aria-label="切換展開收合">
                    <KeyIcon />
                  </button>
                </div>
              </div>
              {secOpen.panel && (
                <div className="secBody">
                  <div className="kv2">
                    <label>個人總評</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>生存值</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>戰鬥值</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>智略值</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>魅力值</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>異能值</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>壓力/崩潰值</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                </div>
              )}
            </div>

            {/* ④ 關係 */}
            <div className="sec">
              <div className="secHead">
                <div className="secTitle">④ 關係</div>
                <div className="secRight">
                  <span className="secHint">{secOpen.relations ? "展開" : "收合"}</span>
                  <button className="keyBtn" onClick={() => toggleSec("relations")} aria-label="切換展開收合">
                    <KeyIcon />
                  </button>
                </div>
              </div>
              {secOpen.relations && (
                <div className="secBody">
                  <div className="kv2">
                    <label>曖昧中人數（動態）</label>
                    <div className="pillDyn">0（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>已定義關係（可多個）</label>
                    <div className="pillDyn">無（遊戲將更新）</div>
                  </div>
                </div>
              )}
            </div>

            {/* ⑤ 名聲 */}
            <div className="sec">
              <div className="secHead">
                <div className="secTitle">⑤ 名聲</div>
                <div className="secRight">
                  <span className="secHint">{secOpen.reputation ? "展開" : "收合"}</span>
                  <button className="keyBtn" onClick={() => toggleSec("reputation")} aria-label="切換展開收合">
                    <KeyIcon />
                  </button>
                </div>
              </div>
              {secOpen.reputation && (
                <div className="secBody">
                  <div className="kv2">
                    <label>名聲標籤（動態更新）</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                  <div className="kv2">
                    <label>風評一句話（動態更新）</label>
                    <div className="pillDyn">尚無風評（遊戲將更新）</div>
                  </div>
                </div>
              )}
            </div>

            {/* ⑥ 成就 */}
            <div className="sec">
              <div className="secHead">
                <div className="secTitle">⑥ 成就</div>
                <div className="secRight">
                  <span className="secHint">{secOpen.achievements ? "展開" : "收合"}</span>
                  <button className="keyBtn" onClick={() => toggleSec("achievements")} aria-label="切換展開收合">
                    <KeyIcon />
                  </button>
                </div>
              </div>
              {secOpen.achievements && (
                <div className="secBody">
                  <div className="kv2">
                    <label>成就（動態更新）</label>
                    <div className="pillDyn">（遊戲將更新）</div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }} className="glassCard">
              <div className="cardPad">
                <div className="cardTitle">操作</div>
                <div className="cardText">你填關鍵欄位，其它可以按「幫我生成（不劇透）」補齊。</div>
                <div className="btnRow">
                  <button className="btnPill" onClick={genNoSpoil}>
                    幫我生成（不劇透）
                  </button>
                  <button className="btnPill btnPillPrimary" onClick={startLife}>
                    開始人生
                  </button>
                  <button className="btnPill" onClick={() => setMode("cover")}>
                    回封面
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "play" && curSave && (
          <div className="bgStage">
            <div className="topBar">
              <div className="brand">
                <div className="brandTitle">正文</div>
                <div className="brandSub">
                  存檔：{curSave.title}｜段落：{curSave.progress.segment}
                </div>
              </div>
              <button className="iconBtn" aria-label="回封面" title="回封面" onClick={() => setMode("cover")}>
                ⌂
              </button>
            </div>

            <div className="glassCard">
              <div className="cardPad">
                {renderStory(logs)}
                {lastMajor && isLastLog(lastMajor, logs) && (
                  <div style={{ marginTop: 14 }}>
                    <div className="cardTitle">關鍵時刻</div>
                    <div style={{ marginTop: 10 }}>
                      {(lastMajor.data?.options || []).map((opt: string, i: number) => (
                        <button key={i} className="btnPill" style={{ width: "100%", marginBottom: 10 }} onClick={() => chooseMajor(opt)}>
                          {opt}
                        </button>
                      ))}
                      <button className="btnPill" style={{ width: "100%" }} onClick={() => chooseMajor("我就這樣做。")}>
                        我就這樣做。
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14 }} className="glassCard">
              <div className="cardPad">
                <div className="cardTitle">我做了什麼</div>
                <div className="cardText">自然語言為主；可選指令：去 交易站 探路</div>
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="例如：我去交易站探路，順便找人聊聊。"
                  />
                </div>
                <div className="btnRow">
                  <button className="btnPill btnPillPrimary" onClick={commitInput}>
                    送出
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderStory(logs: LogRow[]) {
  const view = logs.filter((l) => ["narrative", "wind", "system", "input"].includes(l.kind));
  return (
    <div>
      {view.map((l) => (
        <div key={l.logId} style={{ marginBottom: 12 }}>
          <div className="badge">{labelKind(l.kind)}</div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 8 }}>{l.text}</div>
        </div>
      ))}
    </div>
  );
}

function labelKind(kind: string) {
  if (kind === "narrative") return "正文";
  if (kind === "wind") return "風向";
  if (kind === "input") return "你做了什麼";
  if (kind === "system") return "系統";
  return kind;
}

function isLastLog(target: LogRow, all: LogRow[]) {
  return all.length > 0 && all[all.length - 1].logId === target.logId;
}