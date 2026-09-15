const cheerio = createCheerio();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 当前常用域名，可按需切换 missav.ai / missav.ws / missav.live
const SITE = "https://missav.ai";

let appConfig = {
  ver: 1,
  title: "MissAV",
  site: SITE,
  tabs: [
    { name: "最新更新", ext: { id: "/dm24/cn/" }, ui: 1 },
    { name: "今日热门", ext: { id: "/dm24/cn/today-hot" }, ui: 1 },
    { name: "本周热门", ext: { id: "/dm24/cn/weekly-hot" }, ui: 1 },
    { name: "本月热门", ext: { id: "/dm24/cn/monthly-hot" }, ui: 1 },
    { name: "新作上市", ext: { id: "/dm24/cn/new" }, ui: 1 },
    { name: "无码流出", ext: { id: "/dm24/cn/uncensored-leak" }, ui: 1 },
    { name: "中文字幕", ext: { id: "/dm24/cn/chinese-subtitle" }, ui: 1 },
    { name: "素人", ext: { id: "/dm24/cn/siro" }, ui: 1 },
  ],
};

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  let cards = [];
  let { page = 1, id } = ext;

  let url = appConfig.site + (id || "/dm24/cn/");
  if (page > 1) {
    url = url.replace(/\/$/, "") + "?page=" + page;
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (data.includes("Just a moment...") || data.includes("cf-browser-verification")) {
    $utils.openSafari(url, UA);
  }

  const $ = cheerio.load(data);

  // 兼容多种布局
  $(
    "div.thumbnail.group, .grid > div, .video-item, [class*='thumbnail']"
  ).each((_, element) => {
    const $el = $(element);
    const a = $el.find("a").first();
    let href = a.attr("href") || "";
    const title =
      $el.find(".my-2 a, .text-sm a, .title a, h3, .truncate").text().trim() ||
      a.attr("title") ||
      a.text().trim() ||
      "";
    let cover =
      $el.find("img").attr("data-src") ||
      $el.find("img").attr("src") ||
      $el.find("img").attr("data-original") ||
      "";

    if (!href || !title) return;

    if (href && !href.startsWith("http")) {
      href = appConfig.site + (href.startsWith("/") ? href : "/" + href);
    }
    if (cover && cover.startsWith("//")) {
      cover = "https:" + cover;
    }

    const duration =
      $el.find(".absolute, .duration, [class*='duration']").text().trim() || "";

    cards.push({
      vod_id: href,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: duration,
      vod_duration: duration,
      ext: { url: href },
    });
  });

  // 去重
  const seen = new Set();
  cards = cards.filter((c) => {
    if (seen.has(c.vod_id)) return false;
    seen.add(c.vod_id);
    return true;
  });

  return jsonify({ list: cards });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let tracks = [];
  let url = ext.url;

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
    },
  });

  if (data.includes("Just a moment...") || data.includes("cf-browser-verification")) {
    $utils.openSafari(url, UA);
  }

  // 尝试提取 m3u8 / HLS
  let playUrl = null;

  // 常见：source 或 playlist
  const m3u8Match =
    data.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i) ||
    data.match(/["'](https?:\/\/surrit\.com\/[^"']+)["']/i) ||
    data.match(/source\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
    data.match(/hlsUrl\s*[:=]\s*["']([^"']+)["']/i) ||
    data.match(/playlist\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);

  if (m3u8Match) {
    playUrl = m3u8Match[1];
  }

  // 从 script 里再扫一遍
  if (!playUrl) {
    const $ = cheerio.load(data);
    $("script").each((_, el) => {
      const txt = $(el).html() || "";
      const m =
        txt.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i) ||
        txt.match(/["'](https?:\/\/surrit\.com\/[^"']+)["']/i);
      if (m) {
        playUrl = m[1];
        return false;
      }
    });
  }

  if (playUrl) {
    tracks.push({
      name: "播放",
      pan: "",
      ext: { url: playUrl },
    });
  } else {
    // 回退：直接用页面地址（部分播放器可处理）
    tracks.push({
      name: "页面播放",
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
  return jsonify({ urls: [ext.url] });
}

async function search(ext) {
  ext = argsify(ext);
  let cards = [];
  let text = encodeURIComponent(ext.text || "");
  let page = ext.page || 1;

  // 中文搜索优先
  let url = `${appConfig.site}/dm24/cn/search/${text}`;
  if (page > 1) {
    url += `?page=${page}`;
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
    },
  });

  if (data.includes("Just a moment...") || data.includes("cf-browser-verification")) {
    $utils.openSafari(url, UA);
  }

  const $ = cheerio.load(data);

  $("div.thumbnail.group, .grid > div, .video-item, [class*='thumbnail']").each(
    (_, element) => {
      const $el = $(element);
      const a = $el.find("a").first();
      let href = a.attr("href") || "";
      const title =
        $el.find(".my-2 a, .text-sm a, .title a, h3, .truncate").text().trim() ||
        a.attr("title") ||
        a.text().trim() ||
        "";
      let cover =
        $el.find("img").attr("data-src") ||
        $el.find("img").attr("src") ||
        $el.find("img").attr("data-original") ||
        "";

      if (!href || !title) return;

      if (href && !href.startsWith("http")) {
        href = appConfig.site + (href.startsWith("/") ? href : "/" + href);
      }
      if (cover && cover.startsWith("//")) {
        cover = "https:" + cover;
      }

      cards.push({
        vod_id: href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: "",
        ext: { url: href },
      });
    }
  );

  const seen = new Set();
  cards = cards.filter((c) => {
    if (seen.has(c.vod_id)) return false;
    seen.add(c.vod_id);
    return true;
  });

  return jsonify({ list: cards });
}
