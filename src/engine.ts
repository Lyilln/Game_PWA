import type { SaveRow } from "./db";

export type ParsedInput =
  | { mode: "empty"; raw: string }
  | { mode: "nl"; raw: string }
  | { mode: "cmd"; raw: string; verb: string; target: string; detail: string };

export function parseOptionalCommand(raw: string): ParsedInput {
  const text = (raw || "").trim();
  if (!text) return { mode: "empty", raw: "" };

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { mode: "nl", raw: text };

  const verb = parts[0];
  const target = parts[1];
  const detail = parts.slice(2).join(" ");

  const verbs = new Set(["去", "找", "跟", "回", "偷", "救", "守夜", "探路", "交易", "談判"]);
  if (!verbs.has(verb)) return { mode: "nl", raw: text };

  return { mode: "cmd", raw: text, verb, target, detail };
}

function pickOne<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateWindLines(): string[] {
  const a = [
    "電台：……今晚的頻段很乾淨，乾淨得不正常。",
    "流言：交易站的價碼變了，原因沒人敢問。",
    "基地：有人說看見了『不該出現的人』。",
    "路上：有人沿著雪霧走來，像是在找誰。",
    "耳語：掠奪者最近不搶物資，只搶人。"
  ];
  const b = [
    "有人提到你的暱稱，語氣不像第一次叫。",
    "你聽見一個熟悉的腳步聲，又停住了。",
    "有人在笑，但那笑像是在計算。",
    "有人說你『很危險』，也有人說你『很可靠』。",
    "有人把一件東西塞給你：不是禮物，是試探。"
  ];
  const c = [
    "地下通道傳出金屬摩擦聲，像有人在拆門。",
    "軍方哨點加派巡邏——不是防喪屍，是防人。",
    "基地聯盟派人來『關心』你，關心得太仔細。",
    "商隊領頭人換了，大家都裝作沒看見。",
    "有人欠的債開始被追討，時間剛剛好。"
  ];
  return [pickOne(a), pickOne(b), pickOne(c)];
}

export function shouldTriggerMajorChoice(save: SaveRow): boolean {
  const p = save.world.pacing;
  const n = p.sinceLastMajor || 0;
  const min = p.majorChoiceEveryMin;
  const max = p.majorChoiceEveryMax;
  if (n < min) return false;
  if (n >= max) return true;
  // 中間區間用機率，讓體感落在 4–7
  const span = max - min + 1;
  const chance = (n - min + 1) / span; // 1/span → 1
  return Math.random() < chance;
}

export function makeMajorChoicePrompt(balance: "C" = "C") {
  // 你選 C（平衡）：每次隨機偏生存或偏戀愛，但不劇透
  const kind = Math.random() < 0.5 ? "survival" : "romance";
  if (kind === "survival") {
    return {
      kind,
      title: "關鍵時刻",
      options: [
        "我把風險吞下去，照我原本的計畫走。",
        "我改變路線，換一個更安全但更慢的方法。",
        "我賭一把：用人情或謊言換過這關。"
      ]
    };
  }
  return {
    kind,
    title: "關鍵時刻",
    options: [
      "我把話說到一半，讓他自己來追問。",
      "我選擇靠近：今晚不再假裝沒事。",
      "我先退一步，把主導權留給他（或他們）。"
    ]
  };
}

export function generateNextNarrative(prevSegment: number): string {
  // MVP：先用簡單生成，後面你要接 AI 再換成呼叫模型
  const seeds = [
    "雪霧把遠處吞進去，你只能聽見自己呼吸。",
    "你把手指伸進口袋，摸到一個硬物——像是一把鑰匙。",
    "遠處傳來斷續的槍聲，像是在催你做決定。",
    "有人在你背後停住，沒有靠近，但也沒離開。",
    "世界很安靜，安靜得像在等你犯錯。"
  ];
  const tone = pickOne(seeds);
  return `第 ${prevSegment + 1} 段：${tone}`;
}