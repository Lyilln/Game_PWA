const DB_NAME = "game_pwa_apoc";
const DB_VERSION = 1;

export const STORES = {
  meta: "meta",
  saves: "saves",
  logs: "logs",
  world: "world",
};

export type SaveRow = {
  saveId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  player: PlayerProfile;
  world: WorldState;
  progress: {
    day: number;
    segment: number;
    lastSceneKey: string;
  };
};

export type LogRow = {
  logId: string;
  saveId: string;
  kind: "narrative" | "wind" | "input" | "major_choice" | "system";
  text: string;
  data?: any;
  ts: number;
};

export type PlayerProfile = {
  // ① 基礎信息
  name: string;
  codename: string;
  nickname: string;
  age: number | null;
  gender: "F";
  identity: string; // 動態更新
  talent: string;
  ability: string; // 異能（可空=無）

  // ② 性格
  personalityTags: string[];
  principles: string[];
  currentPersonalityTilt: string; // 動態更新

  // ③ 個人數值面板（展示用）
  panel: {
    overall: number;
    survival: number;
    combat: number;
    strategy: number;
    charm: number;
    abilityPower: number;
    stress: number;
  };

  // ④ 關係
  flirtCount: number;
  definedRelationships: Array<{ npcId: string; label: string; sinceTs: number }>;

  // ⑤ 名聲
  reputationTags: string[];
  publicOpinion: string;

  // ⑥ 成就
  achievements: string[];
};

export type WorldState = {
  flags: Record<string, any>;
  factions: Record<string, { heat: number }>; // 1/2/3/4/6
  pacing: {
    majorChoiceEveryMin: number; // 4
    majorChoiceEveryMax: number; // 7
    weight: "C";
    sinceLastMajor: number;
  };
  ambience: {
    nuclearWinter: true;
    coldIndex: number; // 氛圍用
  };
};

function nowTs() { return Date.now(); }
function uid(prefix="id") { return `${prefix}_${nowTs()}_${Math.random().toString(16).slice(2)}`; }

function promisify<T=any>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORES.saves)) {
        const os = db.createObjectStore(STORES.saves, { keyPath: "saveId" });
        os.createIndex("by_updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.logs)) {
        const os = db.createObjectStore(STORES.logs, { keyPath: "logId" });
        os.createIndex("by_saveId", "saveId", { unique: false });
        os.createIndex("by_ts", "ts", { unique: false });
        os.createIndex("by_kind", "kind", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.world)) {
        db.createObjectStore(STORES.world, { keyPath: "saveId" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeEmptyPlayer(): PlayerProfile {
  return {
    name: "",
    codename: "",
    nickname: "",
    age: null,
    gender: "F",
    identity: "",
    talent: "",
    ability: "",
    personalityTags: [],
    principles: [],
    currentPersonalityTilt: "",
    panel: { overall: 0, survival: 0, combat: 0, strategy: 0, charm: 0, abilityPower: 0, stress: 0 },
    flirtCount: 0,
    definedRelationships: [],
    reputationTags: [],
    publicOpinion: "",
    achievements: [],
  };
}

export function makeEmptyWorld(): WorldState {
  return {
    flags: {},
    factions: { "1": {heat:0}, "2": {heat:0}, "3": {heat:0}, "4": {heat:0}, "6": {heat:0} },
    pacing: { majorChoiceEveryMin: 4, majorChoiceEveryMax: 7, weight: "C", sinceLastMajor: 0 },
    ambience: { nuclearWinter: true, coldIndex: 8 },
  };
}

export async function setMeta(key: string, value: any) {
  const db = await openDB();
  const tx = db.transaction([STORES.meta], "readwrite");
  await promisify(tx.objectStore(STORES.meta).put({ key, value }));
  db.close();
}
export async function getMeta(key: string) {
  const db = await openDB();
  const tx = db.transaction([STORES.meta], "readonly");
  const row = await promisify<any>(tx.objectStore(STORES.meta).get(key));
  db.close();
  return row?.value ?? null;
}

export async function listSaves(): Promise<SaveRow[]> {
  const db = await openDB();
  const tx = db.transaction([STORES.saves], "readonly");
  const os = tx.objectStore(STORES.saves);
  const all = await promisify<SaveRow[]>(os.getAll());
  all.sort((a,b)=> (b.updatedAt||0)-(a.updatedAt||0));
  db.close();
  return all;
}

export async function createSave(title="存檔1", seedPlayer?: Partial<PlayerProfile>): Promise<SaveRow> {
  const db = await openDB();
  const saveId = uid("save");
  const ts = nowTs();

  const player = makeEmptyPlayer();
  Object.assign(player, seedPlayer || {});
  player.gender = "F";

  const world = makeEmptyWorld();

  const row: SaveRow = {
    saveId,
    title,
    createdAt: ts,
    updatedAt: ts,
    player,
    world,
    progress: { day: 1, segment: 0, lastSceneKey: "start" },
  };

  const tx = db.transaction([STORES.saves, STORES.world], "readwrite");
  await promisify(tx.objectStore(STORES.saves).add(row));
  await promisify(tx.objectStore(STORES.world).put({ saveId, ...world }));

  db.close();
  await setMeta("lastSaveId", saveId);
  return row;
}

export async function loadSave(saveId: string): Promise<SaveRow|null> {
  const db = await openDB();
  const tx = db.transaction([STORES.saves], "readonly");
  const row = await promisify<SaveRow>(tx.objectStore(STORES.saves).get(saveId));
  db.close();
  return row || null;
}

export async function updateSave(saveId: string, patchFn: (s: SaveRow)=>void): Promise<SaveRow> {
  const db = await openDB();
  const tx = db.transaction([STORES.saves, STORES.world], "readwrite");
  const os = tx.objectStore(STORES.saves);

  const cur = await promisify<SaveRow>(os.get(saveId));
  if (!cur) { db.close(); throw new Error("Save not found"); }

  const next: SaveRow = structuredClone(cur);
  patchFn(next);
  next.updatedAt = nowTs();

  await promisify(os.put(next));
  await promisify(tx.objectStore(STORES.world).put({ saveId, ...next.world }));
  db.close();

  await setMeta("lastSaveId", saveId);
  return next;
}

export async function appendLog(saveId: string, kind: LogRow["kind"], text: string, data?: any): Promise<LogRow> {
  const db = await openDB();
  const tx = db.transaction([STORES.logs], "readwrite");
  const row: LogRow = { logId: uid("log"), saveId, kind, text, data, ts: nowTs() };
  await promisify(tx.objectStore(STORES.logs).add(row));
  db.close();
  return row;
}

export async function listLogs(saveId: string, limit=40): Promise<LogRow[]> {
  const db = await openDB();
  const tx = db.transaction([STORES.logs], "readonly");
  const os = tx.objectStore(STORES.logs);
  const idx = os.index("by_saveId");
  const all = await promisify<LogRow[]>(idx.getAll(IDBKeyRange.only(saveId)));
  all.sort((a,b)=> (a.ts||0)-(b.ts||0));
  const sliced = all.slice(Math.max(0, all.length - limit));
  db.close();
  return sliced;
}