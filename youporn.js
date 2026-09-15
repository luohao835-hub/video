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
    // YouPorn 分页通常是 ?page=2 或 /page-2/
    url = url + (url.includes("?") ? "&" : "?") + `page=${page}`;
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Cookie: "age_verified=1",
    },
  });

  const $ = cheerio.load(data);

  // 常见选择器，可能需要根据实际页面调整
  $("div.video-box, .video-list .video-box, .js-videoBox, .phimage").each(
    (_, element) => {
      const a = $(element).find("a").first();
      let href = a.attr("href") || "";
      const title =
        a.attr("title") ||
        a.find("img").attr("alt") ||
        $(element).find(".title a").text().trim() ||
        "";
      let cover =
        a.find("img").attr("src") ||
        a.find("img").attr("data-src") ||
        a.find("img").attr("data-mediumthumb") ||
        "";

      if (href && !href.startsWith("http")) {
        href = appConfig.site + href;
      }
      if (cover && !cover.startsWith("http")) {
        cover = "https:" + cover;
      }

      if (href && title) {
        cards.push({
          vod_id: href,
          vod_name: title.trim(),
          vod_pic: cover,
          vod_remarks: $(element).find(".duration").text().trim() || "",
          ext: {
            url: href,
          },
        });
      }
    },
  );

  return jsonify({
    list: cards,
  });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let tracks = [];
  let url = ext.url;

  // 先拿页面
  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
      Cookie: "age_verified=1",
      Referer: appConfig.site + "/",
    },
  });

  // 方法1：尝试从 playervars / mediaDefinitions 提取
  let mediaDefs = null;

  // 匹配 playervars
  const playerMatch = data.match(/playervars\s*[:=]\s*(\{[\s\S]*?\})\s*[,;]/);
  if (playerMatch) {
    try {
      const playervars = JSON.parse(playerMatch[1]);
      mediaDefs = playervars.mediaDefinitions || playervars;
    } catch (e) {}
  }

  // 方法2：尝试 API（有时可用）
  if (!mediaDefs) {
    const idMatch = url.match(/\/watch\/(\d+)/);
    if (idMatch) {
      try {
        const apiUrl = `https://www.youporn.com/api/video/media_definitions/${idMatch[1]}/`;
        const { data: apiData } = await $fetch.get(apiUrl, {
          headers: {
            "User-Agent": UA,
            Cookie: "age_verified=1",
            Referer: url,
          },
        });
        mediaDefs = typeof apiData === "string" ? JSON.parse(apiData) : apiData;
      } catch (e) {}
    }
  }

  if (mediaDefs && Array.isArray(mediaDefs)) {
    mediaDefs.forEach((item) => {
      if (item.videoUrl) {
        tracks.push({
          name:
            (item.quality || item.format || "Default") +
            (item.format ? ` (${item.format})` : ""),
          pan: "",
          ext: {
            url: item.videoUrl,
          },
        });
      }
    });
  }

  // 兜底
  if (tracks.length === 0) {
    tracks.push({
      name: "播放（需嗅探）",
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
        Referer: appConfig.site + "/",
        Cookie: "age_verified=1",
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
      Cookie: "age_verified=1",
    },
  });

  const $ = cheerio.load(data);

  $("div.video-box, .video-list .video-box, .js-videoBox, .phimage").each(
    (_, element) => {
      const a = $(element).find("a").first();
      let href = a.attr("href") || "";
      const title =
        a.attr("title") ||
        a.find("img").attr("alt") ||
        $(element).find(".title a").text().trim() ||
        "";
      let cover =
        a.find("img").attr("src") ||
        a.find("img").attr("data-src") ||
        a.find("img").attr("data-mediumthumb") ||
        "";

      if (href && !href.startsWith("http")) {
        href = appConfig.site + href;
      }
      if (cover && !cover.startsWith("http")) {
        cover = "https:" + cover;
      }

      if (href && title) {
        cards.push({
          vod_id: href,
          vod_name: title.trim(),
          vod_pic: cover,
          vod_remarks: $(element).find(".duration").text().trim() || "",
          ext: {
            url: href,
          },
        });
      }
    },
  );

  return jsonify({
    list: cards,
  });
}
