import { DietFoodSchema, DietService } from './diet.module';

const creatorId = '62177e23b5742725de6c4e35';
const food = {
  _id: '6a359a99857ba5bfb2af7022',
  name: '丰盛的饭',
  unit: 'u',
  calories_per_unit: 200,
  calories_multiplier: 100,
  last_used_time: new Date('2026-07-02T10:55:13.927Z'),
};

describe('DietService food suggestions', () => {
  it('maps food reads and writes to the existing dietfoods collection', () => {
    expect(DietFoodSchema.get('collection')).toBe('dietfoods');
  });

  const execQuery = (value: unknown) => ({
    sort: () => execQuery(value),
    select: () => execQuery(value),
    lean: () => execQuery(value),
    exec: jest.fn().mockResolvedValue(value),
  });

  it('uses dietfood for search and all history for recent foods regardless of month', async () => {
    const oldRecord = {
      _id: 'old-record',
      food_name: '老食物',
      unit: 'u',
      calories_per_unit: 80,
      calories_multiplier: 100,
      amount: 120,
      recorded_time: new Date('2025-01-01T12:00:00Z'),
    };
    const recordsFind = jest.fn().mockReturnValue(execQuery([]));
    const recordsAggregate = jest.fn().mockResolvedValue([{ record: oldRecord }]);
    const foodsFind = jest.fn().mockReturnValue(execQuery([food]));
    const service = new DietService(
      { findById: () => execQuery({ settings: {} }) } as any,
      { find: recordsFind, aggregate: recordsAggregate } as any,
      { find: () => execQuery([]) } as any,
      { find: foodsFind } as any,
    );

    const recent = await service.getSummary(creatorId);
    const january = await service.getSummary(creatorId, '2025-01');

    expect(recent.foods).toEqual([food]);
    expect(january.foods).toEqual([food]);
    expect(recent.recentFoods.map((item) => item.name)).toEqual(['丰盛的饭', '老食物']);
    expect(recent.recentFoods[1].amount).toBe(120);
    expect(january.recentFoods).toEqual(recent.recentFoods);
    expect(recordsFind).toHaveBeenCalledWith(expect.objectContaining({ recorded_time: expect.any(Object) }));
    expect(foodsFind).toHaveBeenCalledWith({ creator: creatorId });
    expect(recordsAggregate.mock.calls[0][0][0].$match).toEqual({ creator: expect.any(Object) });
  });

  it('deduplicates a catalog food and a historical record while preserving the last amount', async () => {
    const record = {
      _id: 'record',
      food_name: food.name,
      unit: 'u',
      calories_per_unit: 190,
      calories_multiplier: 100,
      amount: 150,
      recorded_time: new Date('2026-07-01T12:00:00Z'),
    };
    const service = new DietService(
      { findById: () => execQuery({ settings: {} }) } as any,
      { find: () => execQuery([]), aggregate: () => Promise.resolve([{ record }]) } as any,
      { find: () => execQuery([]) } as any,
      { find: () => execQuery([food]) } as any,
    );

    const result = await service.getSummary(creatorId, '2026-06');
    expect(result.recentFoods).toHaveLength(1);
    expect(result.recentFoods[0]).toMatchObject({
      _id: food._id, name: food.name, calories_per_unit: 200, amount: 150,
    });
  });

  it('upserts dietfood when saving a record for a selected day', async () => {
    const recordSave = jest.fn().mockResolvedValue({ _id: 'record' });
    const statSave = jest.fn().mockResolvedValue({});
    const foodUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
    const recordModel = jest.fn().mockImplementation(() => ({ save: recordSave }));
    const statModel = jest.fn().mockImplementation(() => ({ save: statSave }));
    (statModel as any).findOne = jest.fn().mockReturnValue(execQuery(null));
    const service = new DietService(
      {} as any, recordModel as any, statModel as any, { updateOne: foodUpdate } as any,
    );

    await service.createRecord(creatorId, {
      name: '丰盛的饭', unit: 'u', amount: 100, caloriesPerUnit: 200,
      recordedTime: '2025-01-01T12:00:00Z',
    });

    expect(foodUpdate).toHaveBeenCalledWith(
      { creator: creatorId, name: '丰盛的饭' },
      expect.objectContaining({
        $set: expect.objectContaining({ calories_per_unit: 200, last_used_time: expect.any(Date) }),
        $setOnInsert: { created_time: expect.any(Date) },
      }),
      { upsert: true },
    );
    expect(recordSave).toHaveBeenCalledTimes(1);
    expect(statSave).toHaveBeenCalledTimes(1);
  });
});