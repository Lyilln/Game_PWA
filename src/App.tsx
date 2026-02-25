import React, { useEffect, useMemo, useState } from "react";
import {
  listSaves,
  createSave,
  loadSave,
  updateSave,
  appendLog,
  listLogs,
  makeEmptyPlayer,
  getMeta,
  setMeta,
  countNPCPublic,
  importNPCPublic,
  importNPCSecret,
  renameSave,
  deleteSave,
  duplicateSave,
  type SaveRow,
  type LogRow,
} from "./db";
import {
  generateWindLines,
  parseOptionalCommand,
  shouldTriggerMajorChoice,
  makeMajorChoicePrompt,
  generateNextNarrative,
} from "./engine";

import npcPublic from "./data/npc_public.json";
import npcSecret from "./data/npc_secret.json";

type Mode = "cover" | "setup" | "play";
type SecKey = "base" | "persona" | "panel" | "relations" | "reputation" | "achievements";
type DrawerKey = "profile" | "recap" | "saves" | null;

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 3l9 8h-3v10h-5v-6H11v6H6V11H3l9-8z"/>
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M10 4l2 2h8a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2h6z"/>
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm1 5h-2v6l5 3l1-1.73l-4-2.27V7Z"/>
    </svg>
  );
}
function KeyIcon() {
  // 舊式鑰匙 / skeleton key（不是 emoji）
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.75 14.25a5.5 5.5 0 1 1 5.24-7.18l7.76 7.76V17h-2v2h-2v2h-2.25l-4.03-4.03a5.49 5.49 0 0 1-2.72.78Zm0-2a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Zm0-4.1a.6.6 0 1 1 0 1.2a.6.6 0 0 1 0-1.2Z"
      />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("cover");
  const [drawer, setDrawer] = useState<DrawerKey>(null);

  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [curSave, setCurSave] = useState<SaveRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [input, setInput] = useState("");

  // Setup sections open
  const [secOpen, setSecOpen] = useState<Record<SecKey, boolean>>({
    base: true,
    persona: true,
    panel: true,
    relations: true,
    reputation: true,
    achievements: true,
  });

  // Setup form (B 半手填)
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
    const l = await listLogs(saveId, 80);
    setLogs(l);
    if (goPlay) setMode("play");
  }

  useEffect(() => {
  refreshSaves();
  (async () => {
    // 男人庫只匯入一次：不重複灌資料
    const seeded = await getMeta("npc_seed_v1");
    if (seeded) return;

    const existing = await countNPCPublic();
    if (existing > 0) {
      await setMeta("npc_seed_v1", true);
      return;
    }

    await importNPCPublic(npcPublic as any[]);
    await importNPCSecret(npcSecret as any[]);
    await setMeta("npc_seed_v1", true);
  })();
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

    // dynamic placeholders
    p.identity = "未知身分（系統將更新）";
    p.currentPersonalityTilt = "尚未形成（系統將更新）";
    p.reputationTags = [];
    p.publicOpinion = "尚無風評（系統將更新）";
    p.achievements = [];

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

  const latestNarrative = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].kind === "narrative") return logs[i];
    }
    return null;
  }, [logs]);

  const latestWind = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].kind === "wind") return logs[i];
    }
    return null;
  }, [logs]);

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

  function closeDrawer() {
    setDrawer(null);
  }

async function onRename(saveId: string) {
  const cur = saves.find(x => x.saveId === saveId);
  const v = prompt("新的存檔名稱：", cur?.title || "");
  if (!v) return;
  await renameSave(saveId, v);
  await refreshSaves();
  if (curSave?.saveId === saveId) {
    await openSave(saveId, mode === "play");
  }
}

async function onDuplicate(saveId: string) {
  const cur = saves.find(x => x.saveId === saveId);
  const v = prompt("複製存檔名稱：", `${cur?.title || "存檔"}（複製）`);
  const copy = await duplicateSave(saveId, v || undefined);
  await refreshSaves();
  // 複製完不強制進入，你要進入就點「進入」
}

async function onDelete(saveId: string) {
  const cur = saves.find(x => x.saveId === saveId);
  const ok = confirm(`確定刪除「${cur?.title || "存檔"}」？這會刪掉該存檔所有紀錄。`);
  if (!ok) return;

  const deletingCurrent = curSave?.saveId === saveId;
  await deleteSave(saveId);
  await refreshSaves();

  if (deletingCurrent) {
    setCurSave(null);
    setLogs([]);
    setMode("cover");
    closeDrawer();
  }
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
              <div className="iconRow">
                <button className="iconBtn" aria-label="檔案櫃" title="檔案櫃" onClick={() => setDrawer("saves")}>
                  <IconFolder />
                </button>
              </div>
            </div>

            <div className="glassCard">
              <div className="cardPad">
                <div className="cardTitle">進入世界</div>
                <div className="cardText">
                  每段正文後輸入「我做了什麼」，世界會記住。<br />
                  自然語言為主；可選指令提高解析準度（不強迫）。
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

                <div className="badgeRow">
                  <span className="badge">自然語言為主</span>
                  <span className="badge">可選指令</span>
                  <span className="badge">4–7 段關鍵時刻</span>
                  <span className="badge">關係混合制</span>
                  <span className="badge">異能世界觀</span>
                </div>

                <div className="line" />
                <div className="cardText">
                  男人 NPC 資料庫：<b>尚未接入</b>（目前沒有 npc_public / npc_secret，也沒有匯入流程）
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
              <div className="iconRow">
                <button className="iconBtn" aria-label="返回封面" title="返回封面" onClick={() => setMode("cover")}>
                  <IconHome />
                </button>
              </div>
            </div>

            <Section
              title="① 基礎信息"
              open={secOpen.base}
              onToggle={() => toggleSec("base")}
            >
              <KV label="名字">
                <input value={fName} onChange={(e) => setFName(e.target.value)} />
              </KV>
              <KV label="代號/顯示名">
                <input value={fCodename} onChange={(e) => setFCodename(e.target.value)} />
              </KV>
              <KV label="暱稱">
                <input value={fNickname} onChange={(e) => setFNickname(e.target.value)} />
              </KV>
              <KV label="年齡">
                <input
                  type="number"
                  value={fAge}
                  onChange={(e) => setFAge(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </KV>
              <KV label="性別">
                <div className="pillDyn">女（鎖定）</div>
              </KV>
              <KV label="身分（動態更新）">
                <div className="pillDyn">未知身分（遊戲將更新）</div>
              </KV>
              <KV label="天賦">
                <input value={fTalent} onChange={(e) => setFTalent(e.target.value)} />
              </KV>
              <KV label="異能（可空）">
                <input value={fAbility} onChange={(e) => setFAbility(e.target.value)} />
              </KV>
            </Section>

            <Section
              title="② 性格"
              open={secOpen.persona}
              onToggle={() => toggleSec("persona")}
            >
              <KV label="性格（標籤/自寫）">
                <input
                  placeholder="用逗號分隔，例如：嘴硬心軟、護短"
                  value={fTags}
                  onChange={(e) => setFTags(e.target.value)}
                />
              </KV>
              <KV label="原則/底線">
                <input
                  placeholder="用逗號分隔，例如：不欠人情、不賣隊友"
                  value={fPrinciples}
                  onChange={(e) => setFPrinciples(e.target.value)}
                />
              </KV>
              <KV label="當前性格偏向（動態更新）">
                <div className="pillDyn">尚未形成（遊戲將更新）</div>
              </KV>
            </Section>

            <Section
              title="③ 個人數值面板"
              open={secOpen.panel}
              onToggle={() => toggleSec("panel")}
            >
              <KV label="個人總評"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="生存值"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="戰鬥值"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="智略值"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="魅力值"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="異能值"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="壓力/崩潰值"><div className="pillDyn">（遊戲將更新）</div></KV>
            </Section>

            <Section
              title="④ 關係"
              open={secOpen.relations}
              onToggle={() => toggleSec("relations")}
            >
              <KV label="曖昧中人數（動態）"><div className="pillDyn">0（遊戲將更新）</div></KV>
              <KV label="已定義關係（可多個）"><div className="pillDyn">無（遊戲將更新）</div></KV>
            </Section>

            <Section
              title="⑤ 名聲"
              open={secOpen.reputation}
              onToggle={() => toggleSec("reputation")}
            >
              <KV label="名聲標籤（動態更新）"><div className="pillDyn">（遊戲將更新）</div></KV>
              <KV label="風評一句話（動態更新）"><div className="pillDyn">尚無風評（遊戲將更新）</div></KV>
            </Section>

            <Section
              title="⑥ 成就"
              open={secOpen.achievements}
              onToggle={() => toggleSec("achievements")}
            >
              <KV label="成就（動態更新）"><div className="pillDyn">（遊戲將更新）</div></KV>
            </Section>

            <div className="glassCard" style={{ marginTop: 14 }}>
              <div className="cardPad">
                <div className="cardTitle">操作</div>
                <div className="cardText">你填關鍵欄位，其它可按「幫我生成（不劇透）」補齊。</div>
                <div className="btnRow">
                  <button className="btnPill" onClick={genNoSpoil}>幫我生成（不劇透）</button>
                  <button className="btnPill btnPillPrimary" onClick={startLife}>開始人生</button>
                  <button className="btnPill" onClick={() => setMode("cover")}>回封面</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "play" && curSave && (
          <div className="playStage">
            <div className="playBG" />
            <div className="playContent">
              <div className="hud">
                <div className="hudLeft">
                  <div className="hudTitle">{curSave.title}</div>
                  <div className="hudSub">Day {curSave.progress.day} · 段落 {curSave.progress.segment}</div>
                </div>
                <div className="iconRow">
                  <button className="iconBtn" aria-label="主控面板" title="主控面板" onClick={() => setDrawer("profile")}>
                    <KeyIcon />
                  </button>
                  <button className="iconBtn" aria-label="回顧" title="回顧" onClick={() => setDrawer("recap")}>
                    <IconClock />
                  </button>
                  <button className="iconBtn" aria-label="檔案櫃" title="檔案櫃" onClick={() => setDrawer("saves")}>
                    <IconFolder />
                  </button>
                  <button className="iconBtn" aria-label="回封面" title="回封面" onClick={() => setMode("cover")}>
                    <IconHome />
                  </button>
                </div>
              </div>

              <div className="mediaCard">
                <div className="mediaInner">
                  <div className="storyFrame">
                    <div className="storyFramePad">
                      <div className="storyText">
                        {latestNarrative?.text || "（尚無正文）"}
                      </div>

                      <div className="windMini">
                        {latestWind?.text
                          ? latestWind.text.split("\n").slice(0, 3).join("\n")
                          : "（尚無風向）"}
                      </div>

                      {lastMajor && isLastLog(lastMajor, logs) && (
                        <div style={{ marginTop: 12 }}>
                          <div className="windMini" style={{ background: "rgba(255,255,255,.06)" }}>
                            <b style={{ color: "rgba(234,240,255,.92)" }}>關鍵時刻</b>
                            <div style={{ marginTop: 10 }}>
                              {(lastMajor.data?.options || []).map((opt: string, i: number) => (
                                <button
                                  key={i}
                                  className="btnPill"
                                  style={{ width: "100%", marginBottom: 10 }}
                                  onClick={() => chooseMajor(opt)}
                                >
                                  {opt}
                                </button>
                              ))}
                              <button
                                className="btnPill"
                                style={{ width: "100%" }}
                                onClick={() => chooseMajor("我就這樣做。")}
                              >
                                我就這樣做。
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="castCard">
                    <div className="castLabel">active member</div>
                    <div className="castRow">
                      {getCastPlaceholders().map((c) => (
                        <button
                          key={c.id}
                          className="castItem"
                          onClick={() => {
                            const t = input ? input + "\n" : "";
                            setInput(t + `找 ${c.label} 深聊`);
                          }}
                          aria-label={`快速指令：找 ${c.label} 深聊`}
                          title={`找 ${c.label} 深聊`}
                          style={{ background: "transparent", border: "none", padding: 0 }}
                        >
                          <div className="avatar">{c.initial}</div>
                          <div>{c.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <div className="actionBar">
              <div className="actionInner">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="我做了什麼（自然語言為主；可選指令：去 交易站 探路）"
                />
                <button className="sendBtn" onClick={commitInput}>送出</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawers */}
      {drawer && <div className="drawerBackdrop" onClick={closeDrawer} aria-hidden="true" />}
      {drawer && (
        <div className="drawer" role="dialog" aria-modal="true">
          <div className="drawerPanel">
            <div className="drawerHead">
              <div className="drawerTitle">
                {drawer === "profile" ? "主控面板" : drawer === "recap" ? "回顧" : "檔案櫃"}
              </div>
              <button className="drawerClose" onClick={closeDrawer} aria-label="關閉">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z"/>
                </svg>
              </button>
            </div>

            <div className="drawerBody">
              {drawer === "profile" && (
                <>
                  <div className="listItem">
                    <div className="listItemTitle">{curSave?.player.codename || curSave?.player.name || "（未命名）"}</div>
                    <div className="listItemSub">
                      身分：{curSave?.player.identity || "（系統將更新）"}<br/>
                      風評：{curSave?.player.publicOpinion || "（系統將更新）"}
                    </div>
                  </div>
                  <div className="listItem">
                    <div className="listItemTitle">基礎信息</div>
                    <div className="listItemSub">
                      名字：{curSave?.player.name || "—"}<br/>
                      代號：{curSave?.player.codename || "—"}<br/>
                      暱稱：{curSave?.player.nickname || "—"}<br/>
                      年齡：{curSave?.player.age ?? "—"}<br/>
                      天賦：{curSave?.player.talent || "—"}<br/>
                      異能：{curSave?.player.ability || "（無/未覺醒）"}
                    </div>
                  </div>
                  <div className="listItem">
                    <div className="listItemTitle">性格/原則</div>
                    <div className="listItemSub">
                      性格：{(curSave?.player.personalityTags || []).join("、") || "—"}<br/>
                      原則：{(curSave?.player.principles || []).join("、") || "—"}<br/>
                      當前偏向：{curSave?.player.currentPersonalityTilt || "（系統將更新）"}
                    </div>
                  </div>
                  <div className="listItem">
                    <div className="listItemTitle">男人 NPC 資料庫</div>
                    <div className="listItemSub">尚未接入（目前沒有 npc_public/npc_secret store，也沒有匯入）</div>
                  </div>
                </>
              )}

              {drawer === "recap" && (
                <>
                  {(logs || [])
                    .filter((l) => l.kind === "narrative")
                    .slice(-10)
                    .map((l) => (
                      <div key={l.logId} className="listItem">
                        <div className="listItemSub" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                          {l.text}
                        </div>
                      </div>
                    ))}
                  {(!logs || logs.filter((l) => l.kind === "narrative").length === 0) && (
                    <div className="listItem">
                      <div className="listItemSub">尚無回顧內容。</div>
                    </div>
                  )}
                </>
              )}

              {drawer === "saves" && (
                <>
                  {(saves || []).map((s) => (
                    <div key={s.saveId} className="listItem">
                      <div className="listItemTitle">{s.title}</div>
                      <div className="listItemSub">
                        Day {s.progress.day} · 段落 {s.progress.segment}
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btnPill btnPillPrimary" onClick={async () => { closeDrawer(); await openSave(s.saveId, true); }}>
                          進入
                        </button>
                         <button className="btnPill" onClick={async () => onDuplicate(s.saveId)}>
                           複製
                         </button>
                         <button className="btnPill" onClick={async () => onRename(s.saveId)}>
                           命名
                         </button>
                         <button className="btnPill" onClick={async () => onDelete(s.saveId)}>
                           刪除
                         </button>
                      </div>
                    </div>
                  ))}
                  {(!saves || saves.length === 0) && (
                    <div className="listItem">
                      <div className="listItemSub">目前沒有存檔。</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section(props: { title: string; open: boolean; onToggle: ()=>void; children: React.ReactNode }) {
  return (
    <div className="sec">
      <div className="secHead">
        <div className="secTitle">{props.title}</div>
        <div className="secRight">
          <span className="secHint">{props.open ? "展開" : "收合"}</span>
          <button className="keyBtn" onClick={props.onToggle} aria-label="切換展開收合">
            <KeyIcon />
          </button>
        </div>
      </div>
      {props.open && <div className="secBody">{props.children}</div>}
    </div>
  );
}

function KV(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv2">
      <label>{props.label}</label>
      <div>{props.children}</div>
    </div>
  );
}

function isLastLog(target: LogRow, all: LogRow[]) {
  return all.length > 0 && all[all.length - 1].logId === target.logId;
}

function getCastPlaceholders() {
  // 圖一/圖二那種底部圓形列：先用假資料（不爆雷、不接男主庫）
  return [
    { id: "a", label: "alpha", initial: "A" },
    { id: "b", label: "bravo", initial: "B" },
    { id: "c", label: "cobalt", initial: "C" },
    { id: "d", label: "delta", initial: "D" },
    { id: "e", label: "echo", initial: "E" },
    { id: "f", label: "foxtrot", initial: "F" },
  ];
}