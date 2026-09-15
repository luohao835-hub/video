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

function absUrl(u, base) {
  if (!u) return "";
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  const b = base || appConfig.site;
  return b + (u.startsWith("/") ? u : "/" + u);
}

async function getCards(ext) {
  ext = argsify(ext);
  let cards = [];
  let { page = 1, id } = ext;

  let url = appConfig.site + (id || "/");
  if (page > 1) {
    if (url.indexOf("?") >= 0) {
      url += "&page=" + page;
    } else if (url.endsWith("/")) {
      url = url + page + "/";
    } else {
      url = url + "/" + page + "/";
    }
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      Cookie: "age_verified=1; platform=pc; cookies_accepted=1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!data || data.length < 500) {
    return jsonify({ list: [] });
  }

  const $ = cheerio.load(data);

  // 多种可能选择器（tube 站点常见，与 PornTN / YouPorn 类似）
  const selectors = [
    "div.item",
    "div.thumb",
    "div.video-item",
    "div[class*='thumb']",
    "div[class*='video']",
    "article",
    ".list-videos .item",
    ".thumbs .thumb",
    "a[href*='/video-']",
  ];

  let found = false;
  for (const sel of selectors) {
    const nodes = $(sel);
    if (nodes.length === 0) continue;

    nodes.each((_, element) => {
      const $el = $(element);
      let href = "";
      let title = "";
      let cover = "";
      let duration = "";

      if ($el.is("a")) {
        href = $el.attr("href") || "";
        title = $el.attr("title") || $el.text().trim();
        cover =
          $el.find("img").attr("src") ||
          $el.find("img").attr("data-src") ||
          $el.find("img").attr("data-original") ||
          "";
      } else {
        const a = $el
          .find("a[href*='/video-'], a[href*='/videos/'], a")
          .first();
        href = a.attr("href") || "";
        title =
          a.attr("title") ||
          $el
            .find(".title, .video-title, .name, h3, h4, span.title")
            .text()
            .trim() ||
          a.text().trim() ||
          $el.find("img").attr("alt") ||
          "";
        cover =
          $el.find("img").attr("data-src") ||
          $el.find("img").attr("src") ||
          $el.find("img").attr("data-original") ||
          $el.find("img").attr("data-poster") ||
          "";
        duration =
          $el.find(".duration, .time, [class*='duration']").text().trim() || "";
      }

      if (!href || (!href.includes("video") && !href.includes("/v/"))) return;

      href = absUrl(href);
      cover = absUrl(cover);

      if (href && (title || cover)) {
        cards.push({
          vod_id: href,
          vod_name: (title || href.split("/").pop()).trim(),
          vod_pic: cover,
          vod_remarks: duration,
          vod_duration: duration,
          ext: { url: href },
        });
        found = true;
      }
    });

    if (found && cards.length > 5) break;
  }

  // 最终兜底：全文扫 video- 链接
  if (cards.length === 0) {
    $("a[href*='video-'], a[href*='/videos/']").each((_, el) => {
      let href = absUrl($(el).attr("href") || "");
      if (!href) return;
      const title =
        $(el).attr("title") ||
        $(el).text().trim() ||
        $(el).find("img").attr("alt") ||
        href.split("/").pop();
      const cover = absUrl(
        $(el).find("img").attr("data-src") ||
          $(el).find("img").attr("src") ||
          "",
      );
      cards.push({
        vod_id: href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: "",
        ext: { url: href },
      });
    });
  }

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
  const tracks = [];
  const url = ext.url;

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: appConfig.site + "/",
      Cookie: "age_verified=1; platform=pc; cookies_accepted=1",
    },
  });

  if (!data) {
    tracks.push({ name: "页面播放", pan: "", ext: { url } });
    return jsonify({ list: [{ title: "默认分组", tracks }] });
  }

  let playUrl = null;

  // 1. 类似 YouPorn 的 mediaDefinitions / flashvars / video_url
  const patterns = [
    /mediaDefinitions["']?\s*[:=]\s*(\[[\s\S]*?\])\s*[,;}]/,
    /flashvars\s*[:=]\s*(\{[\s\S]*?\})\s*[,;]/,
    /video_url\s*[:=]\s*["']([^"']+)["']/i,
    /["']video_url["']\s*:\s*["']([^"']+)["']/i,
    /source\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /file\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /src\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i,
    /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i,
  ];

  for (const re of patterns) {
    const m = data.match(re);
    if (!m) continue;

    if (
      re.source.includes("mediaDefinitions") ||
      re.source.includes("flashvars")
    ) {
      try {
        let jsonStr = m[1];
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
        const obj = JSON.parse(jsonStr);
        const list = Array.isArray(obj)
          ? obj
          : obj.mediaDefinitions || obj.video_url || [];
        if (Array.isArray(list) && list.length) {
          list.forEach((item) => {
            const u = item.videoUrl || item.video_url || item.file || item.src;
            if (u) {
              tracks.push({
                name: String(
                  item.quality || item.format || item.height || "Default",
                ),
                pan: "",
                ext: { url: absUrl(u) },
              });
            }
          });
          if (tracks.length) break;
        } else if (typeof obj === "string") {
          playUrl = obj;
        }
      } catch (e) {}
    } else {
      playUrl = m[1];
      break;
    }
  }

  // video / source 标签
  if (!playUrl && tracks.length === 0) {
    const $ = cheerio.load(data);
    playUrl =
      $("video source").attr("src") ||
      $("video").attr("src") ||
      $("source[type*='video']").attr("src") ||
      null;
  }

  if (playUrl) {
    playUrl = absUrl(playUrl);
    tracks.push({
      name: "播放",
      pan: "",
      ext: { url: playUrl },
    });
  }

  if (tracks.length === 0) {
    tracks.push({
      name: "页面播放",
      pan: "",
      ext: { url },
    });
  }

  return jsonify({
    list: [{ title: "默认分组", tracks }],
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  return jsonify({
    urls: [ext.url],
    headers: [
      {
        "User-Agent": UA,
        Referer: appConfig.site + "/",
        Cookie: "age_verified=1; platform=pc",
        Origin: appConfig.site,
      },
    ],
  });
}

async function search(ext) {
  ext = argsify(ext);
  const text = encodeURIComponent(ext.text || "");
  return getCards({ page: 1, id: `/search/${text}/` });
}
