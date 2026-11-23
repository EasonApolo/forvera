import { StockCatalogService } from './market.module';
import { UserService } from './user.module';

const makeCatalogModel = () => {
  const docs = new Map<string, any>();
  const model = {
    findOne: jest.fn((query: { key: string }) => ({
      lean: async () => docs.get(query.key) ?? null,
    })),
    findOneAndUpdate: jest.fn((query: { key: string }, update: any) => ({
      lean: async () => {
        const current = docs.get(query.key);
        if (!current) {
          const created = { ...(update.$setOnInsert || {}), ...(update.$set || {}) };
          docs.set(query.key, created);
          return created;
        }
        const next = { ...current, ...(update.$set || {}) };
        docs.set(query.key, next);
        return next;
      },
    })),
  };
  return { model, docs };
};

describe('StockCatalogService', () => {
  const seed = {
    watchlist: [{ symbol: 'sh600519', name: '贵州茅台', type: '股票', group: '白酒' }],
    groups: ['白酒', '白酒', '  '],
    defaultGroup: '白酒',
  };

  const makeService = (docs?: Map<string, any>) => {
    const { model, docs: store } = makeCatalogModel();
    docs?.forEach((value, key) => store.set(key, value));
    const userService = { findStockCatalogSeed: jest.fn(async () => seed) };
    const service = new StockCatalogService(model as any, userService as any);
    return { service, userService, store };
  };

  it('copies the admin catalog once when the shared document does not exist', async () => {
    const { service, userService } = makeService();

    const created = await service.getCatalog();
    const again = await service.getCatalog();

    expect(created).toEqual({
      watchlist: [{ symbol: 'sh600519', name: '贵州茅台', type: '股票', exchange: undefined, currency: undefined, addedAt: undefined, group: '白酒' }],
      groups: ['白酒'],
      defaultGroup: '白酒',
    });
    expect(again.watchlist).toEqual(created.watchlist);
    expect(userService.findStockCatalogSeed).toHaveBeenCalledTimes(1);
  });

  it('does not replace an existing shared catalog with a user setting', async () => {
    const existing = {
      key: 'default',
      watchlist: [{ symbol: 'usAAPL.OQ', name: '苹果', type: '股票' }],
      groups: ['美股'],
      defaultGroup: '美股',
    };
    const { service, userService } = makeService(new Map([['default', existing]]));

    const catalog = await service.getCatalog();

    expect(catalog.watchlist.map(item => item.symbol)).toEqual(['usAAPL.OQ']);
    expect(catalog.defaultGroup).toBe('美股');
    expect(userService.findStockCatalogSeed).not.toHaveBeenCalled();
  });

  it('updates the shared list without dropping fields that were not sent', async () => {
    const { service } = makeService();
    await service.getCatalog();

    const cleared = await service.updateCatalog({ watchlist: [] });
    expect(cleared.watchlist).toEqual([]);
    expect(cleared.groups).toEqual(['白酒']);

    const renamed = await service.updateCatalog({
      groups: ['消费'],
      defaultGroup: '消费',
    });
    expect(renamed.groups).toEqual(['消费']);
    expect(renamed.defaultGroup).toBe('消费');
    expect(renamed.watchlist).toEqual([]);
  });
});

describe('UserService.findStockCatalogSeed', () => {
  it('uses the admin account that currently holds the instruments', async () => {
    const admins = [
      { settings: { stock: { watchlist: [{ symbol: 'a', name: '少' }], groups: ['小'], defaultGroup: '' } } },
      {
        settings: {
          stock: {
            watchlist: [{ symbol: 'b', name: '多' }, { symbol: 'c', name: '更多' }],
            groups: ['主'],
            defaultGroup: '主',
          },
        },
      },
    ];
    const userModel = {
      find: jest.fn(() => ({
        select: () => ({
          lean: () => ({ exec: async () => admins }),
        }),
      })),
    };
    const service = new UserService(userModel as any);

    await expect(service.findStockCatalogSeed()).resolves.toEqual({
      watchlist: admins[1].settings.stock.watchlist,
      groups: ['主'],
      defaultGroup: '主',
    });
    expect(userModel.find).toHaveBeenCalledWith({ role: 3 });
  });
});
