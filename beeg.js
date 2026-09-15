const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const API_BASE = "https://store.externulls.com";

const CHANNELS = [
  { name: "Blacked", slug: "blacked" },
  { name: "Vixen", slug: "vixencom" },
  { name: "Team Skeet", slug: "teamskeet" },
  { name: "Teen Mega World", slug: "teenmegaworld" },
  { name: "Nubiles", slug: "nubilesporn" },
  { name: "Wow Girls", slug: "wowgirls" },
  { name: "Bratty Sis", slug: "brattysis" },
  { name: "Adult Time", slug: "adulttime" },
  { name: "Family Strokes", slug: "familystrokes" },
  { name: "Ultra Films", slug: "ultrafilms" },
  { name: "Nubile Films", slug: "nubilefilms" },
  { name: "LetsDoeIt", slug: "letsdoeit" },
  { name: "Tiny 4K", slug: "tiny4k" },
  { name: "Naughty America", slug: "naughtyamerica" },
  { name: "Sis Loves Me", slug: "sislovesme" },
  { name: "Pure Taboo", slug: "puretaboo" },
  { name: "Tushy", slug: "tushy" },
  { name: "Deeper", slug: "deeperofficial" },
  { name: "Blacked Raw", slug: "blackedraw" },
  { name: "Perv Mom", slug: "pervmom" },
  { name: "Evil Angel", slug: "evilangel" },
  { name: "JAV HD", slug: "javhd" },
];

const MODELS = [
  { name: "Eva Elfie", slug: "evaelfie" },
  { name: "Angela White", slug: "angelawhite" },
  { name: "Mia Malkova", slug: "miamalkova" },
  { name: "Riley Reid", slug: "rileyreid" },
  { name: "Lana Rhoades", slug: "lanarhoades" },
  { name: "Abella Danger", slug: "abelladanger" },
  { name: "Emily Willis", slug: "emilywillis" },
  { name: "Elsa Jean", slug: "elsajean" },
  { name: "Gabbie Carter", slug: "gabbiecarter" },
  { name: "Blake Blossom", slug: "blakeblossom" },
  { name: "Little Caprice", slug: "littlecaprice" },
  { name: "Liya Silver", slug: "liyasilver" },
];

const tabs = [
  {
    name: "首页",
    ext: { id: "home", url: `${API_BASE}/tag/videos/index` },
  },
  ...CHANNELS.map((ch) => ({
    name: ch.name,
    ext: { id: ch.slug, url: `${API_BASE}/tag/videos/${ch.slug}` },
  })),
  ...MODELS.map((m) => ({
    name: m.name,
    ext: { id: m.slug, url: `${API_BASE}/tag/videos/${m.slug}` },
  })),
];

const appConfig = {
  ver: 1,
  title: "Beeg",
  site: "https://beeg.com",
  tabs,
};

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  try {
    ext = argsify(ext);
    const page = ext.page || 1;
    // API 要求 limit >= 10
    const limit = 48;
    const offset = (page - 1) * limit;
    const base = ext.url || `${API_BASE}/tag/videos/index`;
    const url = `${base}?limit=${limit}&offset=${offset}`;

    const { data } = await $fetch.get(url, {
      headers: {
        "User-Agent": UA,
        Origin: "https://beeg.com",
        Referer: "https://beeg.com/",
      },
    });

    const videos = parseJsonData(data);
    const cards = [];
    if (Array.isArray(videos)) {
      for (const video of videos) {
        const card = buildCardFromVideo(video);
        if (card) cards.push(card);
      }
    }
    return jsonify({ list: cards });
  } catch (e) {
    $print(`getCards error: ${e}`);
    return jsonify({ list: [] });
  }
}

async function getTracks(ext) {
  try {
    ext = argsify(ext);
    const title = ext.title || "播放";
    return jsonify({
      list: [
        {
          title: "默认",
          tracks: [
            {
              name: title,
              pan: "",
              ext: {
                video_id: ext.url,
                file_id: ext.file_id || ext.url,
                title,
                hls_resources: ext.hls_resources || {},
              },
            },
          ],
        },
      ],
    });
  } catch (e) {
    return jsonify({ list: [] });
  }
}

async function getPlayinfo(ext) {
  try {
    ext = argsify(ext);
    let hlsResources = ext.hls_resources;
    let videoId = String(ext.video_id || ext.file_id || ext.url || "");

    // 去掉可能的 -0 前缀
    if (videoId.startsWith("-0")) videoId = videoId.slice(2);
    if (videoId.startsWith("-")) videoId = videoId.slice(1);

    if (!hlsResources || !Object.keys(hlsResources).length) {
      const { data } = await $fetch.get(`${API_BASE}/facts/file/${videoId}`, {
        headers: {
          "User-Agent": UA,
          Origin: "https://beeg.com",
          Referer: "https://beeg.com/",
        },
      });
      const parsed = parseJsonData(data);
      hlsResources =
        parsed?.file?.hls_resources ||
        parsed?.fc_facts?.[0]?.hls_resources ||
        {};
    }

    const urls = [];
    const headers = [
      {
        "User-Agent": UA,
        Referer: "https://beeg.com/",
        Origin: "https://beeg.com",
      },
    ];

    // 新接口：fl_cdn_multi 为 master m3u8（多清晰度）
    if (hlsResources.fl_cdn_multi) {
      urls.push(`https://video.beeg.com/${hlsResources.fl_cdn_multi}`);
    }

    // 兼容旧接口：fl_cdn_720 / fl_cdn_480 ...
    const qualities = [];
    for (const [key, value] of Object.entries(hlsResources)) {
      if (!value || !key.startsWith("fl_cdn_") || key === "fl_cdn_multi")
        continue;
      const m = key.match(/fl_cdn_(\d+)/);
      const height = m ? parseInt(m[1], 10) : 0;
      qualities.push({ height, url: `https://video.beeg.com/${value}` });
    }
    qualities.sort((a, b) => b.height - a.height);
    for (const q of qualities) urls.push(q.url);

    return jsonify({ urls, headers });
  } catch (e) {
    $print(`getPlayinfo error: ${e}`);
    return jsonify({ urls: [] });
  }
}

async function search(ext) {
  try {
    ext = argsify(ext);
    const text = (ext.text || "").trim();
    const page = ext.page || 1;
    if (!text) return jsonify({ list: [] });

    const queryWords = splitQueryWords(text);
    const cards = [];
    const seen = {};
    // 搜索：从首页列表里按标题过滤（官方无稳定公开搜索接口）
    const pagesPerSearchPage = 3;
    const start = (page - 1) * pagesPerSearchPage + 1;
    const end = start + pagesPerSearchPage - 1;

    for (let p = start; p <= end; p++) {
      const offset = (p - 1) * 48;
      const url = `${API_BASE}/tag/videos/index?limit=48&offset=${offset}`;
      try {
        const { data } = await $fetch.get(url, {
          headers: {
            "User-Agent": UA,
            Referer: "https://beeg.com/",
          },
        });
        const videos = parseJsonData(data);
        if (!Array.isArray(videos)) continue;
        for (const video of videos) {
          const card = buildCardFromVideo(video);
          if (
            card &&
            !seen[card.vod_id] &&
            titleMatchesQuery(card.vod_name, queryWords)
          ) {
            seen[card.vod_id] = true;
            cards.push(card);
            if (cards.length >= 48) break;
          }
        }
      } catch (e) {
        $print(`search page ${p}: ${e}`);
      }
      if (cards.length >= 48) break;
    }

    return jsonify({ list: cards });
  } catch (e) {
    return jsonify({ list: [] });
  }
}

function buildCardFromVideo(video) {
  const fcFacts = video.fc_facts?.[0];
  const factId = fcFacts?.id;
  const fileData = video.file?.data || [];
  const fileId = video.file?.id || fileData[0]?.cd_file || factId;
  if (!fileId) return null;

  const duration = video.file?.fl_duration || 0;
  const height = video.file?.fl_height || 0;
  const fcThumbs = fcFacts?.fc_thumbs || [];

  let title = "Untitled";
  for (const item of fileData) {
    if (item.cd_column === "sf_name") {
      title = item.cd_value || title;
      break;
    }
  }

  let cover = "";
  if (fcThumbs.length > 0) {
    // 中间帧更稳一点
    const idx = fcThumbs[Math.min(2, fcThumbs.length - 1)];
    cover = `https://thumbs.externulls.com/videos/${fileId}/${idx}.jpg`;
  }

  return {
    vod_id: String(fileId),
    vod_name: title,
    vod_pic: cover,
    vod_remarks: height
      ? `${height}p ${formatDuration(duration)}`
      : formatDuration(duration),
    ext: {
      url: String(fileId),
      title,
      file_id: fileId,
      fact_id: factId,
      hls_resources: video.file?.hls_resources || {},
    },
  };
}

function parseJsonData(data) {
  return typeof data === "string" ? JSON.parse(data) : data;
}

function normalizeSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function splitQueryWords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

function titleMatchesQuery(title, queryWords) {
  const t = normalizeSlug(title);
  if (!t) return false;
  if (!queryWords.length) return true;
  return queryWords.every((w) => t.includes(w));
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
