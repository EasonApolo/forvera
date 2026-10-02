import axios from 'axios';
import { DocumentService } from './rating.module';

describe('DocumentService.searchMovies', () => {
  let service: DocumentService;
  let now: number;
  let get: jest.SpyInstance;
  const originalProxyUrl = process.env.DOUBAN_PROXY_URL;

  beforeEach(() => {
    delete process.env.DOUBAN_PROXY_URL;
    service = new DocumentService(null, null);
    now = 10000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    get = jest.spyOn(axios, 'get');
  });

  afterEach(() => {
    if (originalProxyUrl === undefined) delete process.env.DOUBAN_PROXY_URL;
    else process.env.DOUBAN_PROXY_URL = originalProxyUrl;
    jest.restoreAllMocks();
  });

  it('trims queries and applies a shared three-second interval', async () => {
    get.mockResolvedValue({ data: [{ id: '1' }] });
    await expect(service.searchMovies('  电影 名称  ')).resolves.toEqual([{ id: '1' }]);
    expect(get).toHaveBeenCalledWith(
      'https://movie.douban.com/j/subject_suggest?q=%E7%94%B5%E5%BD%B1%20%E5%90%8D%E7%A7%B0',
      { timeout: 8000, proxy: false },
    );
    now += 2000;
    await expect(service.searchMovies('另一个电影')).rejects.toMatchObject({ status: 429 });
    expect(get).toHaveBeenCalledTimes(1);
    now += 1000;
    await expect(service.searchMovies('另一个电影')).resolves.toEqual([{ id: '1' }]);
  });

  it('does not consume the interval for an empty query', async () => {
    await expect(service.searchMovies('  ')).rejects.toMatchObject({ status: 400 });
    get.mockResolvedValue({ data: [] });
    await expect(service.searchMovies('电影')).resolves.toEqual([]);
  });

  it('returns a movie card from a shared Douban link using subject_abstract', async () => {
    get.mockResolvedValue({ data: { r: 0, subject: {
      id: '6430835', subtype: 'Movie', title: '猎杀本·拉登 Zero Dark Thirty', release_year: '2012',
    } } });

    await expect(service.searchMovies('分享电影 https://m.douban.com/movie/subject/6430835/?from=share')).resolves.toEqual([{
      id: '6430835', title: '猎杀本·拉登 Zero Dark Thirty',
      url: 'https://movie.douban.com/subject/6430835/',
      img: '', year: '2012',
      type: 'movie', episode: '', sub_title: '',
    }]);
    expect(get).toHaveBeenCalledWith('https://movie.douban.com/j/subject_abstract?subject_id=6430835', {
      timeout: 8000, proxy: false,
    });
  });

  it('rejects foreign URLs and invalid subject IDs without requesting them', async () => {
    await expect(service.searchMovies('https://evil.test/subject/6430835/')).rejects.toMatchObject({ status: 400 });
    await expect(service.searchMovies('https://movie.douban.com/subject/12345/')).rejects.toMatchObject({ status: 400 });
    expect(get).not.toHaveBeenCalled();
  });

  it('reads a doubanapp share link without fetching the supplied URL', async () => {
    get.mockResolvedValue({ data: { r: 0, subject: { id: '6430835', subtype: 'Movie', title: '电影' } } });
    await expect(service.searchMovies('https://www.douban.com/doubanapp/dispatch?uri=%2Fmovie%2F6430835')).resolves.toEqual([
      expect.objectContaining({ id: '6430835', title: '电影' }),
    ]);
    expect(get.mock.calls[0][0]).toBe('https://movie.douban.com/j/subject_abstract?subject_id=6430835');
  });

  it.each([
    { r: 1, subject: null },
    { r: 0, subject: { id: '12345678', subtype: 'Movie', title: 'Wrong movie' } },
    { r: 0, subject: { id: '6430835', subtype: 'TV', title: 'Series' } },
  ])('rejects an invalid or mismatched abstract response', async (data) => {
    get.mockResolvedValue({ data });
    await expect(service.searchMovies('https://movie.douban.com/subject/6430835/')).rejects.toMatchObject({ status: 502 });
  });

  it('identifies an upstream HTTP error instead of reporting no results', async () => {
    get.mockRejectedValue(Object.assign(new Error('blocked'), {
      isAxiosError: true,
      response: { status: 403 },
    }));
    await expect(service.searchMovies('电影')).rejects.toMatchObject({
      status: 502,
      response: { message: '豆瓣接口返回 HTTP 403，搜索失败' },
    });
  });

  it('identifies upstream timeouts and unexpected responses', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('timeout'), {
      isAxiosError: true,
      code: 'ECONNABORTED',
    }));
    await expect(service.searchMovies('电影')).rejects.toMatchObject({ status: 504 });
    expect(get).toHaveBeenCalledTimes(1);
    now += 3000;
    get.mockResolvedValueOnce({ data: '<html>blocked</html>' });
    await expect(service.searchMovies('电影')).rejects.toMatchObject({ status: 502 });
  });

  it('retries a connection reset once within the same search', async () => {
    const reset = Object.assign(new Error('socket hang up'), {
      isAxiosError: true,
      code: 'ECONNRESET',
    });
    get.mockRejectedValueOnce(reset).mockResolvedValueOnce({ data: [{ id: '1' }] });

    await expect(service.searchMovies('电影')).resolves.toEqual([{ id: '1' }]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reports persistent connection resets after one retry', async () => {
    get.mockRejectedValue(Object.assign(new Error('socket hang up'), {
      isAxiosError: true,
      code: 'ECONNRESET',
    }));

    await expect(service.searchMovies('电影')).rejects.toMatchObject({
      status: 502,
      response: { message: '无法直接连接豆瓣接口（ECONNRESET），请稍后重试' },
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('uses the Douban-only proxy for both attempts when configured', async () => {
    process.env.DOUBAN_PROXY_URL = 'http://127.0.0.1:7890';
    get.mockRejectedValue(Object.assign(new Error('socket hang up'), {
      isAxiosError: true,
      code: 'ECONNRESET',
    }));

    await expect(service.searchMovies('电影')).rejects.toMatchObject({
      status: 502,
      response: { message: '无法通过代理连接豆瓣接口（ECONNRESET），请稍后重试' },
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), {
      timeout: 8000,
      proxy: { protocol: 'http', host: '127.0.0.1', port: 7890 },
    });
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), {
      timeout: 8000,
      proxy: { protocol: 'http', host: '127.0.0.1', port: 7890 },
    });
  });
});