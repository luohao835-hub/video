const cheerio = createCheerio();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 可切换：missav.ai / missav.ws / missav.live / missav.media
const SITE = "https://missav.ai";

let appConfig = {
  ver: 1,
  title: "MissAV",
  site: SITE,
  tabs: [
    { name: "最新更新", ext: { id: "/cn/" }, ui: 1 },
    { name: "今日热门", ext: { id: "/cn/today-hot" }, ui: 1 },
    { name: "本周热门", ext: { id: "/cn/weekly-hot" }, ui: 1 },
    { name: "本月热门", ext: { id: "/cn/monthly-hot" }, ui: 1 },
    { name: "新作上市", ext: { id: "/cn/new" }, ui: 1 },
    { name: "无码流出", ext: { id: "/cn/uncensored-leak" }, ui: 1 },
    { name: "中文字幕", ext: { id: "/cn/chinese-subtitle" }, ui: 1 },
    { name: "英文字幕", ext: { id: "/cn/english-subtitle" }, ui: 1 },
    { name: "FC2", ext: { id: "/cn/fc2" }, ui: 1 },
  ],
};

async function getConfig() {
  return jsonify(appConfig);
}

function absUrl(u) {
  if (!u) return "";
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  return appConfig.site + (u.startsWith("/") ? u : "/" + u);
}

function parseListHtml(data) {
  const cards = [];
  const $ = cheerio.load(data);

  // 标准结构：div.thumbnail.group（参考 stash / 各开源插件）
  const items = $(
    "div.thumbnail.group, div[class*='thumbnail'][class*='group'], .grid > div > div.thumbnail",
  );

  items.each((_, element) => {
    const $el = $(element);
    const a =
      $el.find("div.my-2 a, .text-sm a, a[href*='/']").first() ||
      $el.find("a").first();
    let href = a.attr("href") || "";
    let title =
      a.text().trim() ||
      $el.find("img").attr("alt") ||
      $el.find("img").attr("title") ||
      a.attr("title") ||
      "";
    let cover =
      $el.find("img").attr("data-src") ||
      $el.find("img").attr("src") ||
      $el.find("img").attr("data-original") ||
      "";

    if (!href) return;
    href = absUrl(href);
    cover = absUrl(cover);

    // 过滤非影片链接
    if (
      href.includes("/actresses/") ||
      href.includes("/makers/") ||
      href.includes("/genres/") ||
      href.includes("/search")
    ) {
      return;
    }

    const duration =
      $el
        .find(".absolute.bottom-1, .duration, [class*='duration']")
        .text()
        .trim() || "";

    if (title || cover) {
      cards.push({
        vod_id: href,
        vod_name: title || href.split("/").pop(),
        vod_pic: cover,
        vod_remarks: duration,
        vod_duration: duration,
        ext: { url: href },
      });
    }
  });

  // 兜底：任意带番号风格链接
  if (cards.length === 0) {
    $("a[href]").each((_, el) => {
      const href = absUrl($(el).attr("href") || "");
      const m = href.match(/\/([a-z0-9]+-\d+)\/?$/i);
      if (!m) return;
      const title = $(el).text().trim() || m[1];
      const $img = $(el).find("img").length
        ? $(el).find("img")
        : $(el).closest("div").find("img");
      const cover = absUrl($img.attr("data-src") || $img.attr("src") || "");
      cards.push({
        vod_id: href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: "",
        ext: { url: href },
      });
    });
  }

  // 去重
  const seen = new Set();
  return cards.filter((c) => {
    if (!c.vod_id || seen.has(c.vod_id)) return false;
    seen.add(c.vod_id);
    return true;
  });
}

async function getCards(ext) {
  ext = argsify(ext);
  let { page = 1, id } = ext;
  let url = appConfig.site + (id || "/cn/");
  if (page > 1) {
    url = url.replace(/\/$/, "") + "?page=" + page;
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (
    !data ||
    data.includes("Just a moment...") ||
    data.includes("cf-browser-verification") ||
    data.includes("Performing security verification")
  ) {
    $utils.openSafari(url, UA);
  }

  const cards = parseListHtml(data || "");
  return jsonify({ list: cards });
}

/**
 * 从详情页 HTML 提取 surrit / sixyik 等 HLS 地址
 * 参考多个开源项目的策略
 */
function extractM3u8(html) {
  if (!html) return null;

  // Strategy 1: 直接匹配 surrit/sixyik UUID
  let m =
    html.match(/surrit\.com\/([0-9a-f-]{36})/i) ||
    html.match(/sixyik\.com\/([0-9a-f-]{36})/i) ||
    html.match(/nineyu\.com\/([0-9a-f-]{36})/i) ||
    html.match(/fourhoi\.com\/([0-9a-f-]{36})/i);
  if (m) {
    return `https://surrit.com/${m[1]}/playlist.m3u8`;
  }

  // Strategy 2: eval packed 里的 | 分隔字符串
  const evalMatch = html.match(
    /eval\(function\(p,a,c,k,e,d\)[\s\S]*?'([^']+)'\.split\('\|'\)/i,
  );
  if (evalMatch) {
    const parts = evalMatch[1].split("|");
    const hasCdn = parts.some(
      (p) =>
        p === "surrit" || p === "sixyik" || p === "nineyu" || p === "fourhoi",
    );
    if (hasCdn) {
      const uuidParts = parts.filter((p) => /^[0-9a-f]{4,12}$/i.test(p));
      if (uuidParts.length >= 5) {
        const uuid =
          uuidParts[0] +
          "-" +
          uuidParts[1] +
          "-" +
          uuidParts[2] +
          "-" +
          uuidParts[3] +
          "-" +
          uuidParts[4];
        return `https://surrit.com/${uuid}/playlist.m3u8`;
      }
    }
  }

  // Strategy 3: 经典 m3u8|...|video 逆向拼装
  const pipeMatch = html.match(/m3u8\|[^"'<\s]{10,}\|video/i);
  if (pipeMatch) {
    const s = pipeMatch[0].split("|");
    try {
      const hexes = s.filter((x) => /^[0-9a-f]{4,12}$/i.test(x));
      if (hexes.length >= 5) {
        const uuid = `${hexes[0]}-${hexes[1]}-${hexes[2]}-${hexes[3]}-${hexes[4]}`;
        return `https://surrit.com/${uuid}/playlist.m3u8`;
      }
      if (s.length >= 8) {
        const uuid = `${s[5]}-${s[4]}-${s[3]}-${s[2]}-${s[1]}`;
        const host = s[7] && s[6] ? `${s[7]}.${s[6]}` : "surrit.com";
        return `https://${host}/${uuid}/playlist.m3u8`;
      }
    } catch (e) {}
  }

  // Strategy 4: 任意完整 m3u8 链接
  m = html.match(/(https?:\/\/[^"'\s]+\/playlist\.m3u8[^"'\s]*)/i);
  if (m) return m[1];

  m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
  if (m) return m[1];

  // Strategy 5: 页面中第一个看起来像视频 UUID 的
  const uuidRe =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const all = html.match(uuidRe) || [];
  const blacklist = [
    "snaptrckr",
    "user_uuid",
    "popunder",
    "banner",
    "monitoring",
    "crypto",
    "randomUUID",
    "generateUUID",
  ];
  for (const u of all) {
    const idx = html.indexOf(u);
    const ctx = html.substring(Math.max(0, idx - 60), idx + 60);
    if (blacklist.some((b) => ctx.includes(b))) continue;
    return `https://surrit.com/${u}/playlist.m3u8`;
  }

  return null;
}

async function getTracks(ext) {
  ext = argsify(ext);
  const url = ext.url;
  const tracks = [];

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (
    !data ||
    data.includes("Just a moment...") ||
    data.includes("cf-browser-verification")
  ) {
    $utils.openSafari(url, UA);
  }

  const playUrl = extractM3u8(data || "");

  if (playUrl) {
    tracks.push({
      name: "播放",
      pan: "",
      ext: {
        url: playUrl,
        referer: appConfig.site + "/",
      },
    });
  } else {
    tracks.push({
      name: "页面地址",
      pan: "",
      ext: { url: url },
    });
  }

  return jsonify({
    list: [{ title: "默认分组", tracks }],
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  const url = ext.url || "";
  // surrit.com 必须带 Referer，否则 403
  const headers = {
    "User-Agent": UA,
    Referer: appConfig.site + "/",
    Origin: appConfig.site,
  };
  return jsonify({
    urls: [url],
    headers: [headers],
  });
}

async function search(ext) {
  ext = argsify(ext);
  const text = encodeURIComponent(ext.text || "");
  const page = ext.page || 1;
  let url = `${appConfig.site}/cn/search/${text}`;
  if (page > 1) url += `?page=${page}`;

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (
    !data ||
    data.includes("Just a moment...") ||
    data.includes("cf-browser-verification")
  ) {
    $utils.openSafari(url, UA);
  }

  // 搜索页有时是 Recombee 动态加载，静态 HTML 可能为空
  const cards = parseListHtml(data || "");
  return jsonify({ list: cards });
}
