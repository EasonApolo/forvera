import { DietService } from './diet.module';

const creatorId = '62177e23b5742725de6c4e35';

const execQuery = (value: unknown) => ({
  sort: () => execQuery(value),
  select: () => execQuery(value),
  lean: () => execQuery(value),
  exec: jest.fn().mockResolvedValue(value),
});

const latestRecord = (name: string, overrides: Record<string, unknown> = {}) => ({
  record: {
    _id: `record-${name}`,
    food_name: name,
    unit: 'u',
    calories_per_unit: 200,
    calories_multiplier: 100,
    amount: 150,
    quantity: 2,
    recorded_time: new Date('2026-07-01T12:00:00Z'),
    updated_time: new Date('2026-07-01T12:00:00Z'),
    ...overrides,
  },
});

describe('DietService food suggestions', () => {
  it('derives foods and recentFoods from dietrecords regardless of month', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      latestRecord('丰盛的饭'),
      latestRecord('老食物', { amount: 120, quantity: undefined, recorded_time: new Date('2025-01-01T12:00:00Z') }),
    ]);
    const recordsFind = jest.fn().mockReturnValue(execQuery([]));
    const service = new DietService(
      { findById: () => execQuery({ settings: {} }) } as any,
      { find: recordsFind, aggregate } as any,
      { find: () => execQuery([]) } as any,
    );

    const recent = await service.getSummary(creatorId);
    const january = await service.getSummary(creatorId, '2025-01');

    expect(recent.foods.map((food) => food.name)).toEqual(['丰盛的饭', '老食物']);
    expect(recent.foods[0]).toMatchObject({ amount: 150, quantity: 2 });
    expect(recent.foods[1].quantity).toBe(1); // 旧记录缺 quantity 时兜底为 1
    expect(recent.recentFoods).toEqual(recent.foods.slice(0, 5));
    expect(january.foods).toEqual(recent.foods);
    expect(recordsFind).toHaveBeenCalledWith(expect.objectContaining({ recorded_time: expect.any(Object) }));
    expect(aggregate.mock.calls[0][0][0].$match).toEqual({ creator: expect.any(Object) });
  });

  it('saves records with amount and quantity without a separate food table', async () => {
    const recordSave = jest.fn().mockResolvedValue({ _id: 'record' });
    const statSave = jest.fn().mockResolvedValue({});
    const recordModel = jest.fn().mockImplementation(() => ({ save: recordSave }));
    const statModel = jest.fn().mockImplementation(() => ({ save: statSave }));
    (statModel as any).findOne = jest.fn().mockReturnValue(execQuery(null));
    const service = new DietService(
      {} as any,
      recordModel as any,
      statModel as any,
    );

    await service.createRecord(creatorId, {
      name: '丰盛的饭', unit: 'u', amount: 100, quantity: 2, caloriesPerUnit: 200,
      recordedTime: '2025-01-01T12:00:00Z',
    });

    expect(recordSave).toHaveBeenCalledTimes(1);
    expect(recordModel.mock.calls[0][0]).toMatchObject({ food_name: '丰盛的饭', amount: 100, quantity: 2 });
    expect(statSave).toHaveBeenCalledTimes(1);
  });
});
