import { DietService } from './diet.module';

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
      latestRecord('丰盛的饭', { calories_unit: '%' }),
      latestRecord('老食物', { amount: 120, quantity: undefined, recorded_time: new Date('2025-01-01T12:00:00Z') }),
    ]);
    const recordsFind = jest.fn().mockReturnValue(execQuery([]));
    const service = new DietService(
      { findOne: () => execQuery(null) } as any,
      { find: recordsFind, aggregate } as any,
      { find: () => execQuery([]) } as any,
      { find: () => execQuery([]), findOne: () => execQuery(null) } as any,
    );

    const recent = await service.getSummary();
    const january = await service.getSummary('2025-01');

    expect(recent.foods.map((food) => food.name)).toEqual(['丰盛的饭', '老食物']);
    expect(recent.foods[0]).toMatchObject({ amount: 150, quantity: 2 });
    expect(recent.foods[0].calories_unit).toBe('%'); // 再次添加时按当时选的单位回填
    expect(recent.foods[1].calories_unit).toBe('kCal'); // 旧记录缺单位时兜底为 kCal
    expect(recent.recentFoods).toEqual(recent.foods.slice(0, 5));
    expect(january.foods).toEqual(recent.foods);
    expect(recordsFind).toHaveBeenCalledWith(expect.objectContaining({ recorded_time: expect.any(Object) }));
    // 不再按 creator 过滤
    expect(aggregate.mock.calls[0][0][0].$match).toEqual({});
  });

  it('saves records with amount and quantity without creator', async () => {
    const recordSave = jest.fn().mockResolvedValue({ _id: 'record' });
    const statSave = jest.fn().mockResolvedValue({});
    const recordModel = jest.fn().mockImplementation(() => ({ save: recordSave }));
    const statModel = jest.fn().mockImplementation(() => ({ save: statSave }));
    (statModel as any).findOne = jest.fn().mockReturnValue(execQuery(null));
    const service = new DietService(
      {} as any,
      recordModel as any,
      statModel as any,
      {} as any,
    );

    await service.createRecord({
      name: '丰盛的饭', unit: 'u', amount: 100, quantity: 2, caloriesPerUnit: 200, caloriesUnit: 'kJ',
      recordedTime: '2025-01-01T12:00:00Z',
    });

    expect(recordSave).toHaveBeenCalledTimes(1);
    expect(recordModel.mock.calls[0][0]).toMatchObject({ food_name: '丰盛的饭', amount: 100, quantity: 2, calories_unit: 'kJ' });
    expect(recordModel.mock.calls[0][0]).not.toHaveProperty('creator');
    expect(statSave).toHaveBeenCalledTimes(1);
  });

  it('defaults calories_unit to kCal when the client omits it', async () => {
    const recordSave = jest.fn().mockResolvedValue({ _id: 'record' });
    const statSave = jest.fn().mockResolvedValue({});
    const recordModel = jest.fn().mockImplementation(() => ({ save: recordSave }));
    const statModel = jest.fn().mockImplementation(() => ({ save: statSave }));
    (statModel as any).findOne = jest.fn().mockReturnValue(execQuery(null));
    const service = new DietService(
      {} as any,
      recordModel as any,
      statModel as any,
      {} as any,
    );

    await service.createRecord({
      name: '跑步', unit: 'u', amount: 30, quantity: 1, caloriesPerUnit: -300,
    });

    expect(recordModel.mock.calls[0][0]).toMatchObject({ calories_unit: 'kCal' });
  });
});

describe('DietService summary range', () => {
  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const service = () => {
    const recordsFind = jest.fn().mockReturnValue(execQuery([]));
    return {
      recordsFind,
      service: new DietService(
        { findOne: () => execQuery(null) } as any,
        { find: recordsFind, aggregate: jest.fn().mockResolvedValue([]) } as any,
        { find: () => execQuery([]) } as any,
        { find: () => execQuery([]), findOne: () => execQuery(null) } as any,
      ),
    };
  };

  it('uses the last 365 days when year=recent', async () => {
    const { service: diet } = service();
    const recent = await diet.getSummary(undefined, 'recent');
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 365);
    const last = new Date(end);
    last.setDate(last.getDate() - 1);

    expect(recent.days).toHaveLength(365);
    expect(recent.days[0].dayKey).toBe(dayKey(start));
    expect(recent.days[364].dayKey).toBe(dayKey(last));
    expect(recent.month).toBe('');
  });

  it('uses the calendar year when year is YYYY, even if a month is also passed', async () => {
    const { service: diet, recordsFind } = service();
    const year = await diet.getSummary('2025-01', '2024');

    expect(year.days).toHaveLength(366);
    expect(year.days[0].dayKey).toBe('2024-01-01');
    expect(year.days[365].dayKey).toBe('2024-12-31');
    expect(year.month).toBe('2024');
    expect(recordsFind).toHaveBeenCalledWith(expect.objectContaining({
      recorded_time: {
        $gte: new Date(2024, 0, 1),
        $lt: new Date(2025, 0, 1),
      },
    }));
  });
});
