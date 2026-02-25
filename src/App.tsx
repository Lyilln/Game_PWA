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
  type LogRow
} from "./db";
import {
  parseOptionalCommand,
  generateWindLines,
  shouldTriggerMajorChoice,
  makeMajorChoicePrompt,
  generateNextNarrative
} from "./engine";

type Mode = "cover" | "setup" | "play";

export default function App() {
  const [mode, setMode] = useState<Mode>("cover");
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [curSaveId, setCurSaveId] = useState<string>("");
  const [curSave, setCurSave] = useState<SaveRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [input, setInput] = useState("");

  // setup form (B 半手填：你填關鍵欄)
  const [setupName, setSetupName] = useState("");
  const [setupCodename, setSetupCodename] = useState("");
  const [setupNickname, setSetupNickname] = useState("");
  const [setupAge, setSetupAge] = useState<number | "">("");
  const [setupTalent, setSetupTalent] = useState("");
  const [setupAbility, setSetupAbility] = useState("");
  const [setupTags, setSetupTags] = useState("");
  const [setupPrinciples, setSetupPrinciples] = useState("");

  const canContinue = useMemo(() => saves.length > 0, [saves]);

  async function refreshSaves() {
    const all = await listSaves();
    setSaves(all);
  }

  async function openSave(saveId: string, goPlay = true) {
    const s = await loadSave(saveId);
    if (!s) return;
    setCurSaveId(saveId);
    setCurSave(s);
    const l = await listLogs(saveId, 60);
    setLogs(l);
    if (goPlay) setMode("play");
  }

  useEffect(() => {
    refreshSaves();
  }, []);

  // --- cover actions ---
  async function onContinue() {
    if (!saves[0]) return;
    await openSave(saves[0].saveId, true);
  }

  function onNew() {
    // 同頁切換（不分頁）
    setMode("setup");
  }

  async function onLoadMostRecent() {
    if (!saves[0]) return;
    await openSave(saves[0].saveId, true);
  }

  // --- setup actions ---
  function autoGenerateSetup() {
    // 只生成你允許的：天賦/異能/面板初值/動態欄位（但不塞名字除非你沒填）
    if (!setupTalent) setSetupTalent("適應型天賦");
    if (!setupAbility) setSetupAbility(""); // 空=無異能也合理
    if (!setupTags) setSetupTags("嘴硬心軟、護短、很會裝沒事");
    if (!setupPrinciples) setSetupPrinciples("不欠人情、不賣隊友");
  }

  async function startLife() {
    const p = makeEmptyPlayer();
    p.name = setupName.trim();
    p.codename = setupCodename.trim();
    p.nickname = setupNickname.trim();
    p.age = setupAge === "" ? null : Number(setupAge);
    p.talent = setupTalent.trim();
    p.ability = setupAbility.trim();
    p.personalityTags = splitTags(setupTags);
    p.principles = splitTags(setupPrinciples);

    // 初始「動態欄位」給一個可更新的起點
    p.identity = "未知身分（系統將更新）";
    p.currentPersonalityTilt = "尚未形成（系統將更新）";
    p.publicOpinion = "尚無風評（系統將更新）";

    // 面板給一點初值（展示用）
    p.panel.overall = 10;
    p.panel.survival = 10;
    p.panel.combat = 10;
    p.panel.strategy = 10;
    p.panel.charm = 10;
    p.panel.abilityPower = p.ability ? 10 : 0;
    p.panel.stress = 0;

    const save = await createSave("存檔" + (saves.length + 1), p);
    await refreshSaves();
    await openSave(save.saveId, false);

    // 開場：第一段正文 + 風向
    await appendLog(save.saveId, "narrative", "Day 1：你醒來時，世界像被冷色的灰塵覆蓋。");
    const winds = generateWindLines();
    await appendLog(save.saveId, "wind", winds.join("\n"));
    await openSave(save.saveId, true);
  }

  // --- play actions ---
  async function commitInput() {
    if (!curSave) return;
    const text = input.trim();
    if (!text) return;

    const parsed = parseOptionalCommand(text);
    await appendLog(curSave.saveId, "input", text, parsed);

    const updated = await updateSave(curSave.saveId, (s) => {
      // 世界旗標記住你做過什麼（自由度核心）
      const k = `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      s.world.flags[k] = { ts: Date.now(), input: text, parsed };

      // 推進段落計數
      s.progress.segment = (s.progress.segment || 0) + 1;
      s.world.pacing.sinceLastMajor = (s.world.pacing.sinceLastMajor || 0) + 1;
    });

    setCurSave(updated);
    setInput("");

    // 生成下一段正文 + 風向
    const seg = updated.progress.segment || 0;
    await appendLog(updated.saveId, "narrative", generateNextNarrative(seg));
    const winds = generateWindLines();
    await appendLog(updated.saveId, "wind", winds.join("\n"));

    // 可能觸發關鍵時刻（4–7，平衡C）
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

  async function chooseMajor(optionText: string) {
    if (!curSave) return;
    await appendLog(curSave.saveId, "system", `你做出了選擇：${optionText}`);
    // 選完直接推下一段（橙光感）
    const seg = curSave.progress.segment || 0;
    await appendLog(curSave.saveId, "narrative", `你把選擇吞下去，世界也把你記住了。`);
    await appendLog(curSave.saveId, "wind", generateWindLines().join("\n"));
    await openSave(curSave.saveId, true);
  }

  const lastMajor = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].kind === "major_choice") return logs[i];
    }
    return null;
  }, [logs]);

  return (
    <>
      <div className="wrap">
        {mode === "cover" && (
          <div className="card">
            <div className="h1">Game_PWA</div>
            <div className="sub">末世戀愛生存互動式小說（橙光式運作）</div>
            <div className="hr" />
            <div className="row">
              <button className="btn primary" disabled={!canContinue} onClick={onContinue}>繼續</button>
              <button className="btn" onClick={onNew}>新開始</button>
              <button className="btn ghost" disabled={!canContinue} onClick={onLoadMostRecent}>讀檔</button>
            </div>
            <div className="spacer"></div>
            <div className="pill">IndexedDB ✅</div>{" "}
            <div className="pill">PWA ✅</div>{" "}
            <div className="pill">自由輸入 ✅</div>{" "}
            <div className="pill">4–7段關鍵時刻 ✅</div>
          </div>
        )}

        {mode === "setup" && (
          <div className="card">
            <div className="h1">主控建立</div>
            <div className="sub">半手填（你填關鍵欄，其他可生成）／性別鎖定：女</div>
            <div className="hr" />

            <section>
              <div className="sub">① 基礎信息</div>
              <div className="kv"><label>名字</label><input value={setupName} onChange={e=>setSetupName(e.target.value)} /></div>
              <div className="kv"><label>代號/顯示名</label><input value={setupCodename} onChange={e=>setSetupCodename(e.target.value)} /></div>
              <div className="kv"><label>暱稱</label><input value={setupNickname} onChange={e=>setSetupNickname(e.target.value)} /></div>
              <div className="kv"><label>年齡</label><input type="number" value={setupAge} onChange={e=>setSetupAge(e.target.value===""? "": Number(e.target.value))} /></div>
              <div className="kv"><label>天賦</label><input value={setupTalent} onChange={e=>setSetupTalent(e.target.value)} /></div>
              <div className="kv"><label>異能（可空）</label><input value={setupAbility} onChange={e=>setSetupAbility(e.target.value)} /></div>
            </section>

            <div className="hr" />

            <section>
              <div className="sub">② 性格</div>
              <div className="kv"><label>性格標籤（用逗號分隔）</label><input value={setupTags} onChange={e=>setSetupTags(e.target.value)} /></div>
              <div className="kv"><label>原則/底線（逗號分隔）</label><input value={setupPrinciples} onChange={e=>setSetupPrinciples(e.target.value)} /></div>
            </section>

            <div className="hr" />
            <div className="row">
              <button className="btn" onClick={autoGenerateSetup}>幫我生成（不劇透版）</button>
              <button className="btn primary" onClick={startLife}>開始人生</button>
              <button className="btn ghost" onClick={()=>setMode("cover")}>返回</button>
            </div>
          </div>
        )}

        {mode === "play" && curSave && (
          <div className="card">
            <div className="row" style={{justifyContent:"space-between"}}>
              <div>
                <div className="h1">正文</div>
                <div className="sub">存檔：{curSave.title}｜段落：{curSave.progress.segment}</div>
              </div>
              <button className="btn ghost" onClick={()=>setMode("cover")}>回封面</button>
            </div>

            <div className="hr" />

            {/* 顯示最近 narrative + wind */}
            {renderStory(logs)}

            {/* 關鍵時刻（最近一個 major_choice，如果最後一條就是它，就顯示） */}
            {lastMajor && isLastLog(lastMajor, logs) && (
              <div style={{marginTop:14}}>
                <div className="sub">關鍵時刻（2–3選項）</div>
                <div className="spacer"></div>
                {(lastMajor.data?.options || []).map((opt: string, i: number) => (
                  <button key={i} className="choice" onClick={()=>chooseMajor(opt)}>{opt}</button>
                ))}
                <button className="choice" onClick={()=>chooseMajor("我就這樣做。")}>
                  我就這樣做。
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === "play" && curSave && (
        <div className="fixedBar">
          <div className="inner">
            <textarea
              placeholder="我做了什麼（自然語言為主；可選指令：去 交易站 探路）"
              value={input}
              onChange={e=>setInput(e.target.value)}
            />
            <button className="btn primary" onClick={commitInput}>送出</button>
          </div>
        </div>
      )}
    </>
  );
}

function splitTags(s: string): string[] {
  return (s || "")
    .split(/[，,]/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function renderStory(logs: LogRow[]) {
  // 只渲染 narrative/wind/system/input（避免太雜）
  const view = logs.filter(l => ["narrative","wind","system","input"].includes(l.kind));
  return (
    <div>
      {view.map((l) => (
        <div key={l.logId} style={{marginBottom:10}}>
          <div className="pill">{labelKind(l.kind)}</div>
          <div style={{whiteSpace:"pre-wrap", lineHeight:1.6, marginTop:6}}>{l.text}</div>
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