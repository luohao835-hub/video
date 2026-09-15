const cheerio = createCheerio();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let appConfig = {
  ver: 1,
  title: "VXXX",
  site: "https://vxxx.com",
  tabs: [
    { name: "最新", ext: { id: "/" }, ui: 1 },
    { name: "热门", ext: { id: "/most-popular/" }, ui: 1 },
    { name: "最佳", ext: { id: "/top-rated/" }, ui: 1 },
    { name: "最新更新", ext: { id: "/latest-updates/" }, ui: 1 },
  ],
};

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  let cards = [];
  let { page = 1, id } = ext;

  let url = appConfig.site + (id || "/");
  if (page > 1) {
    // 常见分页： /page/2/ 或 ?page=2
    if (url.endsWith("/")) {
      url = url + page + "/";
    } else {
      url = url + "/page/" + page + "/";
    }
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      Cookie: "age_verified=1; platform=pc",
    },
  });

  const $ = cheerio.load(data);

  // 匹配 /video-数字 链接
  $("a[href*='/video-']").each((_, element) => {
    const $a = $(element);
    let href = $a.attr("href") || "";
    if (!href || !href.includes("/video-")) return;

    // 只取卡片主链接，避免重复
    const parent = $a.closest(".item, .thumb, .video-item, [class*='thumb'], article, .card");
    const title =
      $a.attr("title") ||
      parent.find(".title, .video-title, h3, h4, .name").text().trim() ||
      $a.text().trim() ||
      "";
    let cover =
      parent.find("img").attr("src") ||
      parent.find("img").attr("data-src") ||
      parent.find("img").attr("data-original") ||
      $a.find("img").attr("src") ||
      $a.find("img").attr("data-src") ||
      "";

    if (href && !href.startsWith("http")) {
      href = appConfig.site + (href.startsWith("/") ? href : "/" + href);
    }
    if (cover && cover.startsWith("//")) {
      cover = "https:" + cover;
    }

    const duration =
      parent.find(".duration, [class*='duration'], .time").text().trim() || "";

    if (href && (title || cover)) {
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

  // 去重（同一视频可能有多个 a 标签）
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
      Cookie: "age_verified=1; platform=pc",
    },
  });

  let playUrl = null;

  // 常见 tube 站点 video 源提取
  const patterns = [
    /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /video_url\s*[:=]\s*["']([^"']+)["']/i,
    /source\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
    /file\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /src\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
  ];

  for (const re of patterns) {
    const m = data.match(re);
    if (m) {
      playUrl = m[1];
      break;
    }
  }

  // 从 script 再扫
  if (!playUrl) {
    const $ = cheerio.load(data);
    $("script").each((_, el) => {
      const txt = $(el).html() || "";
      for (const re of patterns) {
        const m = txt.match(re);
        if (m) {
          playUrl = m[1];
          return false;
        }
      }
    });
  }

  // video 标签
  if (!playUrl) {
    const $ = cheerio.load(data);
    const src =
      $("video source").attr("src") ||
      $("video").attr("src") ||
      $("source[type*='video']").attr("src");
    if (src) playUrl = src;
  }

  if (playUrl) {
    if (playUrl.startsWith("//")) playUrl = "https:" + playUrl;
    tracks.push({
      name: "播放",
      pan: "",
      ext: { url: playUrl },
    });
  } else {
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

  let url = `${appConfig.site}/search/${text}/`;
  if (page > 1) {
    url = `${appConfig.site}/search/${text}/${page}/`;
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      Cookie: "age_verified=1; platform=pc",
    },
  });

  const $ = cheerio.load(data);

  $("a[href*='/video-']").each((_, element) => {
    const $a = $(element);
    let href = $a.attr("href") || "";
    if (!href || !href.includes("/video-")) return;

    const parent = $a.closest(".item, .thumb, .video-item, [class*='thumb'], article, .card");
    const title =
      $a.attr("title") ||
      parent.find(".title, .video-title, h3, h4, .name").text().trim() ||
      $a.text().trim() ||
      "";
    let cover =
      parent.find("img").attr("src") ||
      parent.find("img").attr("data-src") ||
      $a.find("img").attr("src") ||
      $a.find("img").attr("data-src") ||
      "";

    if (href && !href.startsWith("http")) {
      href = appConfig.site + (href.startsWith("/") ? href : "/" + href);
    }
    if (cover && cover.startsWith("//")) {
      cover = "https:" + cover;
    }

    if (href && (title || cover)) {
      cards.push({
        vod_id: href,
        vod_name: title || href.split("/").pop(),
        vod_pic: cover,
        vod_remarks: "",
        ext: { url: href },
      });
    }
  });

  const seen = new Set();
  cards = cards.filter((c) => {
    if (seen.has(c.vod_id)) return false;
    seen.add(c.vod_id);
    return true;
  });

  return jsonify({ list: cards });
}
