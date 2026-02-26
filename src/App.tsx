import React, { useEffect, useMemo, useRef, useState } from "react";
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
      <path fill="currentColor" d="M12 3l9 8h-3v10h-5v-6H11v6H6V11H3l9-8z" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 4l2 2h8a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2h6z"
      />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm1 5h-2v6l5 3l1-1.73l-4-2.27V7Z"
      />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.75 14.25a5.5 5.5 0 1 1 5.24-7.18l7.76 7.76V17h-2v2h-2v2h-2.25l-4.03-4.03a5.49 5.49 0 0 1-2.72.78Zm0-2a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Zm0-4.1a.6.6 0 1 1 0 1.2a.6.6 0 0 1 0-1.2Z"
      />
    </svg>
  );
}
function IconTheme() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 18a6 6 0 1 1 6-6a6 6 0 0 1-6 6Zm0-10a4 4 0 1 0 4 4a4 4 0 0 0-4-4ZM11 2h2v3h-2V2Zm0 19h2v3h-2v-3ZM2 11h3v2H2v-2Zm19 0h3v2h-3v-2ZM4.22 4.22l1.42-1.42L7.76 4.92 6.34 6.34 4.22 4.22Zm12.02 12.02l1.42-1.42 2.12 2.12-1.42 1.42-2.12-2.12ZM17.66 6.34l-1.42-1.42 2.12-2.12 1.42 1.42-2.12 2.12ZM6.34 17.66l-1.42-1.42 2.12-2.12 1.42 1.42-2.12 2.12Z"
      />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("cover");
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  const [profileTab, setProfileTab] = useState<
    "base" | "persona" | "panel" | "relations" | "reputation" | "achievements"
  >("base");

  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [curSave, setCurSave] = useState<SaveRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [input, setInput] = useState("");

  // ===== Bubble Cast Drag (UI only) =====
  const railRef = useRef<HTMLDivElement | null>(null);
  const [bubblePos, setBubblePos] = useState<Record<string, { x: number; y: number }>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragMoved = useRef(false);
  const lastDragEndTs = useRef(0);

  function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
  }

  function onBubbleDown(id: string, e: React.PointerEvent) {
    const host = railRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const cur = bubblePos[id] || { x: 10, y: 10 };

    dragOffset.current = {
      dx: e.clientX - (rect.left + cur.x),
      dy: e.clientY - (rect.top + cur.y),
    };

    dragMoved.current = false;
    setDragId(id);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  useEffect(() => {
    if (!dragId) return;

    function onMove(ev: PointerEvent) {
      const host = railRef.current;
      if (!host) return;

      const rect = host.getBoundingClientRect();
      const BW = 74; // bubble 寬（含陰影）
      const BH = 92; // bubble 高（含名字）

      const nx = ev.clientX - rect.left - dragOffset.current.dx;
      const ny = ev.clientY - rect.top - dragOffset.current.dy;

      const x = clamp(nx, 0, rect.width - BW);
      const y = clamp(ny, 0, rect.height - BH);

      dragMoved.current = true;
      setBubblePos((p) => ({ ...p, [dragId]: { x, y } }));
    }

    function onUp() {
      lastDragEndTs.current = Date.now();
      setDragId(null);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove as any);
      window.removeEventListener("pointerup", onUp as any);
    };
  }, [dragId, bubblePos]);

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

  // 方便在 JSX 內避免型別欄位缺失爆 TS
  const p: any = (curSave as any)?.player || {};
  const prog: any = (curSave as any)?.progress || {};

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
    setSecOpen((prev) => ({ ...prev, [k]: !prev[k] }));
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
    try {
      const player: any = makeEmptyPlayer();

      player.name = fName.trim();
      player.codename = fCodename.trim();
      player.nickname = fNickname.trim();
      player.age = fAge === "" ? null : Number(fAge);
      player.talent = fTalent.trim();
      player.ability = fAbility.trim();

      player.personalityTags = splitTags(fTags);
      player.principles = splitTags(fPrinciples);

      player.identity = "未知身分（系統將更新）";
      player.currentPersonalityTilt = "尚未形成（系統將更新）";
      player.reputationTags = [];
      player.publicOpinion = "尚無風評（系統將更新）";
      player.achievements = [];

      if (!player.panel) player.panel = {};
      player.panel.overall = 10;
      player.panel.survival = 10;
      player.panel.combat = 10;
      player.panel.strategy = 10;
      player.panel.charm = 10;
      player.panel.abilityPower = player.ability ? 10 : 0;
      player.panel.stress = 0;

      const save = await createSave("存檔" + (saves.length + 1), player);
      await refreshSaves();

      await appendLog(save.saveId, "narrative", "Day 1：你醒來時，世界像被冷色的灰塵覆蓋。");
      await appendLog(save.saveId, "wind", generateWindLines().join("\n"));

      await openSave(save.saveId, true);
    } catch (err: any) {
      console.error(err);
      alert("開始人生失敗（資料庫/存檔錯誤）：\n" + String(err?.message || err));
    }
  }

  async function commitInput() {
    if (!curSave) return;
    const text = input.trim();
    if (!text) return;

    const parsed = parseOptionalCommand(text);
    await appendLog(curSave.saveId, "input", text, parsed);

    const updated = await updateSave(curSave.saveId, (s: any) => {
      const k = `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      s.world.flags[k] = { ts: Date.now(), input: text, parsed };

      s.progress.segment = (s.progress.segment || 0) + 1;
      s.world.pacing.sinceLastMajor = (s.world.pacing.sinceLastMajor || 0) + 1;
    });

    setInput("");
    setCurSave(updated);

    const seg = (updated as any).progress?.segment || 0;
    await appendLog(updated.saveId, "narrative", generateNextNarrative(seg));
    await appendLog(updated.saveId, "wind", generateWindLines().join("\n"));

    const reloaded = await loadSave(updated.saveId);
    if (reloaded && shouldTriggerMajorChoice(reloaded)) {
      const m = makeMajorChoicePrompt("C");
      await appendLog(updated.saveId, "major_choice", (m as any).title, m);
      await updateSave(updated.saveId, (s: any) => {
        s.world.pacing.sinceLastMajor = 0;
      });
    }

    await openSave(updated.saveId, true);
  }

  const latestNarrative = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if ((logs[i] as any).kind === "narrative") return logs[i];
    }
    return null;
  }, [logs]);

  const latestWind = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if ((logs[i] as any).kind === "wind") return logs[i];
    }
    return null;
  }, [logs]);

  const lastMajor = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if ((logs[i] as any).kind === "major_choice") return logs[i];
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
    const cur = saves.find((x) => (x as any).saveId === saveId);
    const v = prompt("新的存檔名稱：", (cur as any)?.title || "");
    if (!v) return;
    await renameSave(saveId, v);
    await refreshSaves();
    if ((curSave as any)?.saveId === saveId) {
      await openSave(saveId, mode === "play");
    }
  }

  async function onDuplicate(saveId: string) {
    const cur = saves.find((x) => (x as any).saveId === saveId);
    const v = prompt("複製存檔名稱：", `${(cur as any)?.title || "存檔"}（複製）`);
    await duplicateSave(saveId, v || undefined);
    await refreshSaves();
  }

  async function onDelete(saveId: string) {
    const cur = saves.find((x) => (x as any).saveId === saveId);
    const ok = confirm(`確定刪除「${(cur as any)?.title || "存檔"}」？這會刪掉該存檔所有紀錄。`);
    if (!ok) return;

    const deletingCurrent = (curSave as any)?.saveId === saveId;
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
          <div className="nativeScreen">
            <div className="nativeTopBar">
              <div className="nativeTopLeft">
                <div className="nativeAppName">Game_PWA</div>
                <div className="nativeAppSub">末世戀愛生存互動式小說 · IndexedDB</div>
              </div>

              <div className="nativeTopRight">
                <button className="nativeIconBtn" aria-label="檔案櫃" title="檔案櫃" onClick={() => setDrawer("saves")}>
                  <IconFolder />
                </button>
              </div>
            </div>

            <div className="nativeMain">
              <div className="nativeHeroCard">
                <div className="nativeHeroTitle">進入世界</div>
                <div className="nativeHeroText">
                  {"每段正文後輸入「我做了什麼」，世界會記住。\n自然語言為主；可選指令（不強迫）。"}
                </div>

                <div className="nativeChips">
                  <span className="nativeChip">可選指令</span>
                  <span className="nativeChip">關係混合制</span>
                  <span className="nativeChip">異能</span>
                </div>
              </div>
            </div>

            <div className="nativeDock">
              <button className="dockBtn dockPrimary" disabled={!canContinue} onClick={onContinue}>
                繼續
              </button>
              <button className="dockBtn" onClick={onNew}>
                新開始
              </button>
              <button className="dockBtn" disabled={!canContinue} onClick={onLoadMostRecent}>
                讀檔
              </button>
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

            <Section title="① 基礎信息" open={secOpen.base} onToggle={() => toggleSec("base")}>
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

            <Section title="② 性格" open={secOpen.persona} onToggle={() => toggleSec("persona")}>
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

            <Section title="③ 個人數值面板" open={secOpen.panel} onToggle={() => toggleSec("panel")}>
              <KV label="個人總評">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="生存值">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="戰鬥值">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="智略值">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="魅力值">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="異能值">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="壓力/崩潰值">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
            </Section>

            <Section title="④ 關係" open={secOpen.relations} onToggle={() => toggleSec("relations")}>
              <KV label="曖昧中人數（動態）">
                <div className="pillDyn">0（遊戲將更新）</div>
              </KV>
              <KV label="已定義關係（可多個）">
                <div className="pillDyn">無（遊戲將更新）</div>
              </KV>
            </Section>

            <Section title="⑤ 名聲" open={secOpen.reputation} onToggle={() => toggleSec("reputation")}>
              <KV label="名聲標籤（動態更新）">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
              <KV label="風評一句話（動態更新）">
                <div className="pillDyn">尚無風評（遊戲將更新）</div>
              </KV>
            </Section>

            <Section title="⑥ 成就" open={secOpen.achievements} onToggle={() => toggleSec("achievements")}>
              <KV label="成就（動態更新）">
                <div className="pillDyn">（遊戲將更新）</div>
              </KV>
            </Section>

            <div className="glassCard" style={{ marginTop: 14 }}>
              <div className="cardPad">
                <div className="cardTitle">操作</div>
                <div className="cardText">你填關鍵欄位，其它可按「幫我生成（不劇透）」補齊。</div>
                <div className="btnRow">
                  <button className="btnPill" onClick={genNoSpoil}>
                    幫我生成（不劇透）
                  </button>
                  <button
  className="btnPill btnPillPrimary"
  onClick={() => {
    setMode("play");           // 先切到 play（立刻有反應）
    void startLife();          // 背後照樣跑存檔/寫log/開存檔
  }}
>
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

        {/* 刪除：你現在 play 的 mediaCard/storyFrame/castRail 那整段 */}
{/* 貼上：以下「play 的卡片區塊」完整替換（只替換 JSX 內那一塊，不動玩法函式） */}

{mode === "play" && curSave && (
  <div className="playStage">
    <div className="playBG" />

    <div className="playContent modeWrap">
      <div className="hud">
        <div className="hudLeft">
          <div className="hudTitle">{(curSave as any).title}</div>
          <div className="hudSub">
            Day {prog.day ?? 1} · 段落 {prog.segment ?? 0}
          </div>
        </div>

        <div className="iconRow">
          <button className="iconBtn" aria-label="主控面板" title="主控面板" onClick={() => setDrawer("profile")}>
            <KeyIcon />
          </button>

          <button
            className="iconBtn"
            aria-label="切換主題"
            title="切換主題"
            onClick={() => setThemeMode((t) => (t === "system" ? "dark" : t === "dark" ? "light" : "system"))}
          >
            <IconTheme />
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
          {/* 大媒體卡（主視覺） */}
          <div className="bigMedia">
            <div className="bigMediaPad">
              <div className="storyText">{(latestNarrative as any)?.text || "（尚無正文）"}</div>

              <div className="windMini">
                {(latestWind as any)?.text
                  ? String((latestWind as any).text).split("\n").slice(0, 3).join("\n")
                  : "（尚無風向）"}
              </div>

              {lastMajor && isLastLog(lastMajor, logs) && (
                <div style={{ marginTop: 12 }}>
                  <div className="windMini" style={{ background: "rgba(255,255,255,.06)" }}>
                    <b style={{ color: "rgba(234,240,255,.92)" }}>關鍵時刻</b>
                    <div style={{ marginTop: 10 }}>
                      {(((lastMajor as any).data?.options || []) as string[]).map((opt: string, i: number) => (
                        <button
                          key={i}
                          className="btnPill"
                          style={{ width: "100%", marginBottom: 10 }}
                          onClick={() => chooseMajor(opt)}
                        >
                          {opt}
                        </button>
                      ))}
                      <button className="btnPill" style={{ width: "100%" }} onClick={() => chooseMajor("我就這樣做。")}>
                        我就這樣做。
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 底座：圓形頭像泡泡（可拖拽、可散佈） */}
          <div className="castRail">
            <div className="castLabel">active member</div>

            <div className="castPlayground" ref={railRef}>
              {getRecentCastFromLogs(logs, 6).map((c, i) => {
                const baseX = 10 + i * 72;
                const baseY = 10;
                const pos = bubblePos[c.id] || { x: baseX, y: baseY };

                return (
                  <button
                    key={c.id}
                    className={`castBubble castBtn ${dragId === c.id ? "dragging" : ""}`}
                    onPointerDown={(e) => onBubbleDown(c.id, e)}
                    onClick={() => {
                      const t = input ? input + "\n" : "";
                      const opts = [`找 ${c.label} 深聊`, `跟 ${c.label} 守夜`, `問 ${c.label} 一件事`];
                      const pick = opts[Math.floor(Math.random() * opts.length)];
                      setInput(t + pick);
                    }}
                    style={
                      {
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        ["--d" as any]: `${(i % 6) * 0.35}s`,
                      } as React.CSSProperties
                    }
                  >
                    <div className="avatar">{c.initial}</div>
                    <div className="castName">{c.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 漂浮輸入框（在 playStage 裡面，不是整頁 fixed） */}
      <div className="actionBar">
        <div className="actionInner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="我做了什麼（自然語言為主；可選指令：去 交易站 探路）"
          />
          <button className="sendBtn" onClick={commitInput}>
            送出
          </button>
        </div>
      </div>

      {drawer && <div className="drawerBackdrop" onClick={closeDrawer} aria-hidden="true" />}
      {drawer && (
        <div className="drawer" role="dialog" aria-modal="true">
          <div className="drawerPanel">
            <div className="drawerHead">
              <div className="drawerTitle">{drawer === "profile" ? "主控面板" : drawer === "recap" ? "回顧" : "檔案櫃"}</div>
              <button className="drawerClose" onClick={closeDrawer} aria-label="關閉">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z"
                  />
                </svg>
              </button>
            </div>

            <div className="drawerBody">
              {drawer === "profile" && (
                <>
                  <div className="profileHero">
                    <div className="profileHeroPad">
                      <div className="profileHeroTop">
                        <div>
                          <div className="profileName">{p.codename || p.name || "（未命名）"}</div>
                          <div className="profileMeta">{`身分：${p.identity || "（系統將更新）"}\n風評：${
                            p.publicOpinion || "（系統將更新）"
                          }`}</div>
                        </div>
                        <div className="miniPill">♀ 女</div>
                      </div>

                      <div className="profilePills">
                        <span className="miniPill">天賦：{p.talent || "—"}</span>
                        <span className="miniPill">異能：{p.ability || "（無/未覺醒）"}</span>
                        <span className="miniPill">曖昧：{p.flirtCount ?? 0}</span>
                        <span className="miniPill">已定義：{(p.definedRelationships || []).length}</span>
                      </div>

                      <div className="profileGrid">
                        <div className="profileBox">
                          <div className="profileBoxTitle">名字 / 暱稱</div>
                          <div className="profileBoxValue">{`${p.name || "—"}\n${p.nickname || "—"}`}</div>
                        </div>
                        <div className="profileBox">
                          <div className="profileBoxTitle">性格偏向（動態）</div>
                          <div className="profileBoxValue">{p.currentPersonalityTilt || "（系統將更新）"}</div>
                        </div>
                      </div>

                      <div className="drawerTabs">
                        <button className={`tabBtn ${profileTab === "base" ? "active" : ""}`} onClick={() => setProfileTab("base")}>
                          基礎
                        </button>
                        <button
                          className={`tabBtn ${profileTab === "persona" ? "active" : ""}`}
                          onClick={() => setProfileTab("persona")}
                        >
                          性格
                        </button>
                        <button className={`tabBtn ${profileTab === "panel" ? "active" : ""}`} onClick={() => setProfileTab("panel")}>
                          數值
                        </button>
                        <button
                          className={`tabBtn ${profileTab === "relations" ? "active" : ""}`}
                          onClick={() => setProfileTab("relations")}
                        >
                          關係
                        </button>
                        <button
                          className={`tabBtn ${profileTab === "reputation" ? "active" : ""}`}
                          onClick={() => setProfileTab("reputation")}
                        >
                          名聲
                        </button>
                        <button
                          className={`tabBtn ${profileTab === "achievements" ? "active" : ""}`}
                          onClick={() => setProfileTab("achievements")}
                        >
                          成就
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="profileRail">
                    <div className="profileRailTitle">active member</div>
                    <div className="castRow">
                      {getRecentCastFromLogs(logs, 6).map((c) => (
                        <button
                          key={c.id}
                          className="castItem castBtn"
                          onClick={() => {
                            const t = input ? input + "\n" : "";
                            const opts = [`找 ${c.label} 深聊`, `跟 ${c.label} 守夜`, `問 ${c.label} 一件事`];
                            const pick = opts[Math.floor(Math.random() * opts.length)];
                            setInput(t + pick);
                            closeDrawer();
                          }}
                        >
                          <div className="avatar">{c.initial}</div>
                          <div>{c.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="line" />

                  {profileTab === "base" && (
                    <div className="listItem">
                      <div className="listItemTitle">基礎信息</div>
                      <div className="listItemSub">
                        名字：{p.name || "—"}
                        {"\n"}代號：{p.codename || "—"}
                        {"\n"}暱稱：{p.nickname || "—"}
                        {"\n"}年齡：{p.age ?? "—"}
                      </div>
                    </div>
                  )}

                  {profileTab === "persona" && (
                    <div className="listItem">
                      <div className="listItemTitle">性格 / 原則</div>
                      <div className="listItemSub">
                        性格：{(p.personalityTags || []).join("、") || "—"}
                        {"\n"}原則：{(p.principles || []).join("、") || "—"}
                      </div>
                    </div>
                  )}

                  {profileTab === "panel" && (
                    <div className="listItem">
                      <div className="listItemTitle">個人數值面板</div>
                      <div className="listItemSub">
                        總評：{p.panel?.overall ?? 0}
                        {"\n"}生存：{p.panel?.survival ?? 0}｜戰鬥：{p.panel?.combat ?? 0}
                        {"\n"}智略：{p.panel?.strategy ?? 0}｜魅力：{p.panel?.charm ?? 0}
                        {"\n"}異能：{p.panel?.abilityPower ?? 0}｜壓力：{p.panel?.stress ?? 0}
                      </div>
                    </div>
                  )}

                  {profileTab === "relations" && (
                    <div className="listItem">
                      <div className="listItemTitle">關係狀態</div>
                      <div className="listItemSub">
                        曖昧中人數：{p.flirtCount ?? 0}
                        {"\n"}已定義關係：
                        {(p.definedRelationships || []).length === 0
                          ? " 無"
                          : "\n" + (p.definedRelationships || []).map((r: any) => `- ${r.label}（${r.npcId}）`).join("\n")}
                      </div>
                    </div>
                  )}

                  {profileTab === "reputation" && (
                    <div className="listItem">
                      <div className="listItemTitle">名聲</div>
                      <div className="listItemSub">
                        標籤：{(p.reputationTags || []).join("、") || "—"}
                        {"\n"}風評：{p.publicOpinion || "（系統將更新）"}
                      </div>
                    </div>
                  )}

                  {profileTab === "achievements" && (
                    <div className="listItem">
                      <div className="listItemTitle">成就</div>
                      <div className="listItemSub">
                        {(p.achievements || []).length === 0 ? "尚無成就。" : (p.achievements || []).map((a: any) => `• ${a}`).join("\n")}
                      </div>
                    </div>
                  )}

                  <div className="listItem">
                    <div className="listItemTitle">男人 NPC 資料庫</div>
                    <div className="listItemSub">已匯入（public/secret）。你不用打開 secret 檔案。</div>
                  </div>
                </>
              )}

              {drawer === "recap" && (
                <>
                  {(logs || [])
                    .filter((l) => (l as any).kind === "narrative")
                    .slice(-10)
                    .map((l) => (
                      <div key={(l as any).logId} className="listItem">
                        <div className="listItemSub" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                          {(l as any).text}
                        </div>
                      </div>
                    ))}
                  {(!logs || logs.filter((l) => (l as any).kind === "narrative").length === 0) && (
                    <div className="listItem">
                      <div className="listItemSub">尚無回顧內容。</div>
                    </div>
                  )}
                </>
              )}

              {drawer === "saves" && (
                <>
                  {(saves || []).map((s) => (
                    <div key={(s as any).saveId} className="listItem">
                      <div className="listItemTitle">{(s as any).title}</div>
                      <div className="listItemSub">
                        Day {(s as any).progress?.day ?? 1} · 段落 {(s as any).progress?.segment ?? 0}
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          className="btnPill btnPillPrimary"
                          onClick={async () => {
                            closeDrawer();
                            await openSave((s as any).saveId, true);
                          }}
                        >
                          進入
                        </button>
                        <button className="btnPill" onClick={async () => onDuplicate((s as any).saveId)}>
                          複製
                        </button>
                        <button className="btnPill" onClick={async () => onRename((s as any).saveId)}>
                          命名
                        </button>
                        <button className="btnPill" onClick={async () => onDelete((s as any).saveId)}>
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

function Section(props: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
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
  const t: any = target as any;
  const a: any[] = all as any[];
  return a.length > 0 && a[a.length - 1]?.logId === t.logId;
}

function extractTargetsFromInput(text: string): string[] {
  const s = (text || "").trim();
  if (!s) return [];

  const out: string[] = [];

  const m1 = s.match(/^(找|跟|問|叫)\s+([^\s，,。！？!?\n]{1,12})/);
  if (m1) out.push(m1[2]);

  const m2 = s.match(/(找|跟|問|叫)([^\s，,。！？!?\n]{1,12})/g);
  if (m2) {
    for (const chunk of m2) {
      const mm = chunk.match(/(找|跟|問|叫)([^\s，,。！？!?\n]{1,12})/);
      if (mm) out.push(mm[2]);
    }
  }

  return Array.from(new Set(out)).slice(0, 12);
}

function getRecentCastFromLogs(logs: LogRow[], fallback = 6) {
  const a: any[] = logs as any[];
  const targets: string[] = [];
  for (let i = a.length - 1; i >= 0; i--) {
    const l = a[i];
    if (l?.kind !== "input") continue;
    const names = extractTargetsFromInput(String(l.text || ""));
    for (const n of names) {
      if (!targets.includes(n)) targets.push(n);
      if (targets.length >= fallback) break;
    }
    if (targets.length >= fallback) break;
  }

  const fillers = ["alpha", "bravo", "cobalt", "delta", "echo", "foxtrot", "moss", "nova"];
  while (targets.length < fallback) {
    const f = fillers[targets.length % fillers.length];
    if (!targets.includes(f)) targets.push(f);
    else targets.push(f + "2");
  }

  return targets.map((label, idx) => ({
    id: `cast_${idx}_${label}`,
    label,
    initial: (label[0] || "?").toUpperCase(),
  }));
}