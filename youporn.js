const cheerio = createCheerio();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let appConfig = {
  ver: 1,
  title: "YouPorn",
  site: "https://www.youporn.com",
  tabs: [
    { name: "Recommended", ext: { id: "/" }, ui: 1 },
    { name: "Most Viewed", ext: { id: "/most_viewed/" }, ui: 1 },
    { name: "Top Rated", ext: { id: "/top_rated/" }, ui: 1 },
    { name: "Newest", ext: { id: "/time/" }, ui: 1 },
  ],
};

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  let cards = [];
  let { page = 1, id } = ext;

  let url = appConfig.site + id;
  if (page > 1) {
    url += (url.includes("?") ? "&" : "?") + `page=${page}`;
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Cookie: "age_verified=1; platform=pc",
      Referer: appConfig.site + "/",
    },
  });

  const $ = cheerio.load(data);

  $("article.video-box").each((_, element) => {
    const $el = $(element);
    const vid = $el.attr("data-video-id") || "";
    let href = $el.find("a").first().attr("href") || "";
    const title =
      $el.attr("aria-label") ||
      $el.find(".video-title-text span").text().trim() ||
      $el.find(".video-title-text").text().trim() ||
      "";

    let cover =
      $el.find("img").attr("src") ||
      $el.find("img").attr("data-src") ||
      $el.find("img").attr("data-poster") ||
      "";

    if (href && !href.startsWith("http")) href = appConfig.site + href;
    if (cover && cover.startsWith("//")) cover = "https:" + cover;

    const duration =
      $el.find('.duration, [class*="duration"]').text().trim() || "";

    if (href && title) {
      cards.push({
        vod_id: vid || href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: duration,
        ext: { url: href },
      });
    }
  });

  return jsonify({ list: cards });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let tracks = [];
  const url = ext.url;

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Cookie: "age_verified=1; platform=pc",
      Referer: appConfig.site + "/",
    },
  });

  // 提取 mediaDefinitions（兼容转义）
  let mediaDefs = null;
  const m = data.match(/"mediaDefinitions"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
  if (m) {
    try {
      const raw = m[1]
        .replace(/\\"/g, '"')
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&");
      mediaDefs = JSON.parse(raw);
    } catch (e) {}
  }

  // 备用：从 page 里找 hls / mp4 中间地址
  if (!mediaDefs || !Array.isArray(mediaDefs)) {
    const hlsMatch = data.match(
      /https:\/\/www\.youporn\.com\/media\/hls\/\?s=[^"\\]+/,
    );
    const mp4Match = data.match(
      /https:\/\/www\.youporn\.com\/media\/mp4\/\?s=[^"\\]+/,
    );
    mediaDefs = [];
    if (hlsMatch) mediaDefs.push({ format: "hls", videoUrl: hlsMatch[0] });
    if (mp4Match) mediaDefs.push({ format: "mp4", videoUrl: mp4Match[0] });
  }

  if (mediaDefs && mediaDefs.length > 0) {
    // 优先 hls，其次 mp4
    const candidates = [
      ...mediaDefs.filter((i) => i.format === "hls" && i.videoUrl),
      ...mediaDefs.filter((i) => i.format === "mp4" && i.videoUrl),
      ...mediaDefs.filter((i) => i.videoUrl),
    ];

    for (const item of candidates) {
      try {
        const { data: realData } = await $fetch.get(item.videoUrl, {
          headers: {
            "User-Agent": UA,
            Cookie: "age_verified=1; platform=pc",
            Referer: url,
            Origin: "https://www.youporn.com",
          },
        });

        let list =
          typeof realData === "string" ? JSON.parse(realData) : realData;
        if (!Array.isArray(list)) continue;

        list
          .filter((x) => x.videoUrl)
          .sort(
            (a, b) =>
              (parseInt(b.quality) || parseInt(b.height) || 0) -
              (parseInt(a.quality) || parseInt(a.height) || 0),
          )
          .forEach((x) => {
            tracks.push({
              name: (x.quality || x.height || x.format || "Default") + "p",
              pan: "",
              ext: { url: x.videoUrl },
            });
          });

        if (tracks.length > 0) break;
      } catch (e) {
        // 二次请求失败，先把中间地址放进去兜底
        tracks.push({
          name: (item.format || "default").toUpperCase(),
          pan: "",
          ext: { url: item.videoUrl },
        });
      }
    }
  }

  // 最终兜底：返回原页面
  if (tracks.length === 0) {
    tracks.push({
      name: "默认",
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
  const url = ext.url;

  // 如果还是中间地址，再试一次解析
  if (url.includes("/media/hls/") || url.includes("/media/mp4/")) {
    try {
      const { data: realData } = await $fetch.get(url, {
        headers: {
          "User-Agent": UA,
          Cookie: "age_verified=1; platform=pc",
          Referer: "https://www.youporn.com/",
          Origin: "https://www.youporn.com",
        },
      });
      let list = typeof realData === "string" ? JSON.parse(realData) : realData;
      if (Array.isArray(list) && list.length > 0) {
        // 取最高清晰度
        list.sort(
          (a, b) =>
            (parseInt(b.quality) || parseInt(b.height) || 0) -
            (parseInt(a.quality) || parseInt(a.height) || 0),
        );
        const best = list[0];
        if (best && best.videoUrl) {
          return jsonify({
            urls: [best.videoUrl],
            headers: [
              {
                "User-Agent": UA,
                Referer: "https://www.youporn.com/",
                Origin: "https://www.youporn.com",
                Cookie: "age_verified=1; platform=pc",
              },
            ],
          });
        }
      }
    } catch (e) {}
  }

  return jsonify({
    urls: [url],
    headers: [
      {
        "User-Agent": UA,
        Referer: "https://www.youporn.com/",
        Origin: "https://www.youporn.com",
        Cookie: "age_verified=1; platform=pc",
      },
    ],
  });
}

async function search(ext) {
  ext = argsify(ext);
  let cards = [];
  const text = encodeURIComponent(ext.text);
  const page = ext.page || 1;
  const url = `${appConfig.site}/search/?query=${text}&page=${page}`;

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Cookie: "age_verified=1; platform=pc",
      Referer: appConfig.site + "/",
    },
  });

  const $ = cheerio.load(data);

  $("article.video-box").each((_, element) => {
    const $el = $(element);
    const vid = $el.attr("data-video-id") || "";
    let href = $el.find("a").first().attr("href") || "";
    const title =
      $el.attr("aria-label") ||
      $el.find(".video-title-text span").text().trim() ||
      $el.find(".video-title-text").text().trim() ||
      "";

    let cover =
      $el.find("img").attr("src") ||
      $el.find("img").attr("data-src") ||
      $el.find("img").attr("data-poster") ||
      "";

    if (href && !href.startsWith("http")) href = appConfig.site + href;
    if (cover && cover.startsWith("//")) cover = "https:" + cover;

    const duration =
      $el.find('.duration, [class*="duration"]').text().trim() || "";

    if (href && title) {
      cards.push({
        vod_id: vid || href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: duration,
        ext: { url: href },
      });
    }
  });

  return jsonify({ list: cards });
}
