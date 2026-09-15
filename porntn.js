const cheerio = createCheerio();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let appConfig = {
  ver: 1,
  title: "PornTN",
  site: "https://porntn.com",
  tabs: [
    {
      name: "Trending",
      ext: { id: "/" },
      ui: 1,
    },
    {
      name: "Latest",
      ext: { id: "/latest-updates/" },
      ui: 1,
    },
    {
      name: "Most Viewed",
      ext: { id: "/most-popular/" },
      ui: 1,
    },
    {
      name: "Top Rated",
      ext: { id: "/top-rated/" },
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
    url = url + (id.endsWith("/") ? "" : "/") + page + "/";
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
    },
  });

  const $ = cheerio.load(data);

  $(".item").each((_, element) => {
    const a = $(element).find("a").first();
    const href = a.attr("href");
    const title = a.attr("title") || a.find("img").attr("alt") || "";
    let cover =
      a.find("img").attr("src") || a.find("img").attr("data-src") || "";

    // 处理相对路径
    if (cover && !cover.startsWith("http")) {
      cover = appConfig.site + cover;
    }

    if (href && title) {
      cards.push({
        vod_id: href,
        vod_name: title.trim(),
        vod_pic: cover,
        vod_remarks: "",
        ext: {
          url: href.startsWith("http") ? href : appConfig.site + href,
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
    },
  });

  // 从 flashvars 里提取视频地址
  const match = data.match(/flashvars\s*=\s*(\{[\s\S]*?\});/);
  if (match) {
    try {
      // 简单提取关键字段
      const videoUrlMatch = match[1].match(/video_url:\s*'([^']+)'/);
      const altUrlMatch = match[1].match(/video_alt_url:\s*'([^']+)'/);
      const altTextMatch = match[1].match(/video_alt_url_text:\s*'([^']+)'/);
      const urlTextMatch = match[1].match(/video_url_text:\s*'([^']+)'/);

      if (altUrlMatch) {
        tracks.push({
          name: altTextMatch ? altTextMatch[1] : "1080p",
          pan: "",
          ext: {
            url: altUrlMatch[1],
          },
        });
      }
      if (videoUrlMatch) {
        tracks.push({
          name: urlTextMatch ? urlTextMatch[1] : "480p",
          pan: "",
          ext: {
            url: videoUrlMatch[1],
          },
        });
      }
    } catch (e) {}
  }

  // 兜底：如果没提取到，返回空
  if (tracks.length === 0) {
    tracks.push({
      name: "播放",
      pan: "",
      ext: {
        url: url, // 让播放器尝试嗅探
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
      },
    ],
  });
}

async function search(ext) {
  ext = argsify(ext);
  let cards = [];
  let text = encodeURIComponent(ext.text);
  let page = ext.page || 1;

  let url = `${appConfig.site}/search/${text}/`;
  if (page > 1) {
    url += page + "/";
  }

  const { data } = await $fetch.get(url, {
    headers: {
      "User-Agent": UA,
    },
  });

  const $ = cheerio.load(data);

  $(".item").each((_, element) => {
    const a = $(element).find("a").first();
    const href = a.attr("href");
    const title = a.attr("title") || a.find("img").attr("alt") || "";
    let cover =
      a.find("img").attr("src") || a.find("img").attr("data-src") || "";

    if (cover && !cover.startsWith("http")) {
      cover = appConfig.site + cover;
    }

    if (href && title) {
      cards.push({
        vod_id: href,
        vod_name: title.trim(),
        vod_pic: cover,
        vod_remarks: "",
        ext: {
          url: href.startsWith("http") ? href : appConfig.site + href,
        },
      });
    }
  });

  return jsonify({
    list: cards,
  });
}
