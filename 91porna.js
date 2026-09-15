const cheerio = createCheerio()

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const appConfig = {
  ver: 1,
  title: '91porna',
  site: 'https://91porna.com',
  tabs: [
    { name: '正在播放', ext: { category: 'play' } },
    { name: '当前最热', ext: { category: 'now_hot' } },
    { name: '最近更新', ext: { category: 'new' } },
    { name: '91原创', ext: { category: 'original' } },
    { name: '本月最热', ext: { category: 'now_month_hot' } },
    { name: '10分钟以上', ext: { category: 'long' } },
    { name: '20分钟以上', ext: { category: 'long2' } },
    { name: '本月收藏', ext: { category: 'now_month_fav' } },
    { name: '高清', ext: { category: 'hd' } },
    { name: '每月最热', ext: { category: 'month_hot' } },
    { name: '本月讨论', ext: { category: 'now_month_comment' } },
    { name: '收藏最多', ext: { category: 'most_fav' } },
  ],
}

async function getConfig() {
  return jsonify(appConfig)
}

async function getCards(ext) {
  ext = argsify(ext)
  const page = ext.page || 1
  const category = ext.category || 'play'
  const url = `${appConfig.site}/comic/index/video?category=${category}&page=${page}`

  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA, Referer: appConfig.site + '/' },
  })

  const $ = cheerio.load(data)
  const cards = []

  $('.video-item').each((_, el) => {
    const a = $(el).find('a[href*="detail"]').first()
    const href = a.attr('href')
    if (!href || href.includes('http') && !href.includes('91porna')) return

    const img = $(el).find('img').first()
    const title =
      img.attr('alt') ||
      $(el).find('.title, .name, p').text().trim() ||
      '未命名'
    const cover =
      img.attr('data-src') ||
      img.attr('src') ||
      ''

    // 跳过广告位
    if (!href.includes('video_key') && !href.includes('detail')) return

    const fullUrl = href.startsWith('http')
      ? href
      : appConfig.site + href

    cards.push({
      vod_id: fullUrl,
      vod_name: title.replace(/\s+/g, ' ').trim(),
      vod_pic: cover.startsWith('http') ? cover : (cover ? appConfig.site + cover : ''),
      vod_remarks: '',
      ext: { url: fullUrl },
    })
  })

  return jsonify({ list: cards })
}

async function getTracks(ext) {
  ext = argsify(ext)
  const url = ext.url

  const tracks = [
    {
      name: '播放',
      pan: '',
      ext: { url },
    },
  ]

  return jsonify({
    list: [{ title: '默认分组', tracks }],
  })
}

async function getPlayinfo(ext) {
  ext = argsify(ext)
  const detailUrl = ext.url

  // 1. 打开详情页，拿到 detail_play 链接（含加密参数 u）
  const { data: detailHtml } = await $fetch.get(detailUrl, {
    headers: { 'User-Agent': UA, Referer: appConfig.site + '/' },
  })

  let playApi = ''
  const m1 = detailHtml.match(/\/index\/detail_play\?[^"'<\s]+/)
  if (m1) {
    playApi = appConfig.site + m1[0].replace(/&amp;/g, '&')
  }

  if (!playApi) {
    // 兜底：尝试从页面直接抠 m3u8
    const direct = detailHtml.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/)
    if (direct) {
      return jsonify({ urls: [direct[0]] })
    }
    return jsonify({ urls: [] })
  }

  // 2. 请求 detail_play，响应是打包 JS，里面有明文 m3u8
  const { data: playJs } = await $fetch.get(playApi, {
    headers: {
      'User-Agent': UA,
      Referer: detailUrl,
    },
  })

  let m3u8 = ''
  const m2 = playJs.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/)
  if (m2) m3u8 = m2[0]

  // 再兜底一次从详情页扫
  if (!m3u8) {
    const m3 = detailHtml.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/)
    if (m3) m3u8 = m3[0]
  }

  if (!m3u8) {
    return jsonify({ urls: [] })
  }

  return jsonify({
    urls: [m3u8],
    headers: [
      {
        'User-Agent': UA,
        Referer: appConfig.site + '/',
      },
    ],
  })
}

async function search(ext) {
  ext = argsify(ext)
  const text = encodeURIComponent(ext.text || '')
  const page = ext.page || 1
  const url = `${appConfig.site}/comic/index/search?keyword=${text}&page=${page}`

  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA, Referer: appConfig.site + '/' },
  })

  const $ = cheerio.load(data)
  const cards = []

  $('.video-item').each((_, el) => {
    const a = $(el).find('a[href*="detail"]').first()
    const href = a.attr('href')
    if (!href) return

    const img = $(el).find('img').first()
    const title = img.attr('alt') || $(el).text().trim() || '未命名'
    const cover = img.attr('data-src') || img.attr('src') || ''

    const fullUrl = href.startsWith('http') ? href : appConfig.site + href

    cards.push({
      vod_id: fullUrl,
      vod_name: title.replace(/\s+/g, ' ').trim(),
      vod_pic: cover.startsWith('http') ? cover : (cover ? appConfig.site + cover : ''),
      vod_remarks: '',
      ext: { url: fullUrl },
    })
  })

  return jsonify({ list: cards })
}
