const cheerio = createCheerio();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let appConfig = {
  ver: 1,
  title: "YouPorn",
  site: "https://www.youporn.com",
  tabs: [
    {
      name: "Recommended",
      ext: { id: "/" },
      ui: 1,
    },
    {
      name: "Most Viewed",
      ext: { id: "/most_viewed/" },
      ui: 1,
    },
    {
      name: "Top Rated",
      ext: { id: "/top_rated/" },
      ui: 1,
    },
    {
      name: "Newest",
      ext: { id: "/time/" },
      ui: 1,
    },
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
    url = url + (url.includes("?") ? "&" : "?") + `page=${page}`;
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

    if (href && !href.startsWith("http")) {
      href = appConfig.site + href;
    }
    if (cover && cover.startsWith("//")) {
      cover = "https:" + cover;
    }

    const duration =
      $el.find('.duration, [class*="duration"]').text().trim() || "";

    if (href && title) {
      cards.push({
        vod_id: vid || href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: duration,
        ext: {
          url: href,
        },
      });
    }
  });

  return jsonify({
    list: cards,
  });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let tracks = [];
  let url = ext.url;

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Cookie: "age_verified=1; platform=pc",
      Referer: appConfig.site + "/",
    },
  });

  let mediaDefs = null;

  // 1. 提取 playervars 里的 mediaDefinitions
  const playerMatch = data.match(
    /mediaDefinitions["']?\s*[:=]\s*(\[[\s\S]*?\])\s*[,}]/,
  );
  if (playerMatch) {
    try {
      const raw = playerMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&");
      mediaDefs = JSON.parse(raw);
    } catch (e) {}
  }

  // 2. 如果没取到，尝试 API
  if (!mediaDefs || !Array.isArray(mediaDefs)) {
    const idMatch = url.match(/\/watch\/(\d+)/);
    if (idMatch) {
      try {
        const apiUrl = `https://www.youporn.com/api/video/media_definitions/${idMatch[1]}/`;
        const { data: apiData } = await $fetch.get(apiUrl, {
          headers: {
            "User-Agent": UA,
            Cookie: "age_verified=1; platform=pc",
            Referer: url,
          },
        });
        mediaDefs = typeof apiData === "string" ? JSON.parse(apiData) : apiData;
      } catch (e) {}
    }
  }

  if (mediaDefs && Array.isArray(mediaDefs) && mediaDefs.length > 0) {
    // 优先找 hls 格式的中间地址
    let intermediate = mediaDefs.find(
      (item) => item.format === "hls" && item.videoUrl,
    );
    if (!intermediate) {
      intermediate = mediaDefs.find((item) => item.videoUrl);
    }

    if (intermediate && intermediate.videoUrl) {
      try {
        // 请求中间地址，拿到真正的清晰度列表
        const { data: realData } = await $fetch.get(intermediate.videoUrl, {
          headers: {
            "User-Agent": UA,
            Cookie: "age_verified=1; platform=pc",
            Referer: url,
          },
        });

        let realList =
          typeof realData === "string" ? JSON.parse(realData) : realData;

        if (Array.isArray(realList) && realList.length > 0) {
          // 按质量从高到低排序
          realList
            .filter((item) => item.videoUrl)
            .sort(
              (a, b) =>
                (parseInt(b.quality) || parseInt(b.height) || 0) -
                (parseInt(a.quality) || parseInt(a.height) || 0),
            )
            .forEach((item) => {
              tracks.push({
                name:
                  (item.quality || item.height || item.format || "Default") +
                  "p",
                pan: "",
                ext: {
                  url: item.videoUrl,
                },
              });
            });
        }
      } catch (e) {
        // 中间请求失败就用原始地址兜底
        tracks.push({
          name: intermediate.quality || intermediate.format || "默认",
          pan: "",
          ext: {
            url: intermediate.videoUrl,
          },
        });
      }
    }
  }

  // 最终兜底
  if (tracks.length === 0) {
    tracks.push({
      name: "默认播放",
      pan: "",
      ext: {
        url: url,
      },
    });
  }

  return jsonify({
    list: [
      {
        title: "默认分组",
        tracks,
      },
    ],
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  const url = ext.url;

  return jsonify({
    urls: [url],
    headers: [
      {
        "User-Agent": UA,
        Referer: "https://www.youporn.com/",
        Cookie: "age_verified=1; platform=pc",
        Origin: "https://www.youporn.com",
      },
    ],
  });
}

async function search(ext) {
  ext = argsify(ext);
  let cards = [];
  let text = encodeURIComponent(ext.text);
  let page = ext.page || 1;

  let url = `${appConfig.site}/search/?query=${text}&page=${page}`;

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

    if (href && !href.startsWith("http")) {
      href = appConfig.site + href;
    }
    if (cover && cover.startsWith("//")) {
      cover = "https:" + cover;
    }

    const duration =
      $el.find('.duration, [class*="duration"]').text().trim() || "";

    if (href && title) {
      cards.push({
        vod_id: vid || href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: duration,
        ext: {
          url: href,
        },
      });
    }
  });

  return jsonify({
    list: cards,
  });
}
