import {
  Module,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { MongooseModule, Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document as MongooseDocument } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { Public } from 'src/guards/jwt-auth.guard';

type PetTodoKind =
  | 'eat-oreo'
  | 'eat-cheese-beef-burger'
  | 'eat-luosifen'
  | 'eat-sichuan-hotpot'
  | 'eat-bbq'
  | 'eat-salad'
  | 'eat-baozi'
  | 'drink-water'
  | 'drink-hot-water'
  | 'drink-cold-water'
  | 'drink-coffee'
  | 'drink-tea'
  | 'drink-red-date-goji-tea'
  | 'drink-ice-coconut-water'
  | 'drink-hot-soymilk'
  | 'drink-ice-cream'
  | 'sleep'
  | 'watch-short-video'
  | 'play-genshin'
  | 'slow-jog'
  | 'work-code'
  | 'work-live';
type PetTodoStatus = 'running' | 'done' | 'cancelled';
type PetTodoMode = 'finite' | 'ongoing';
type AutoPickSource = 'hunger' | 'thirst' | 'energy' | 'happiness' | 'work' | 'leisure';
type TimePeriod = 'morning' | 'forenoon' | 'noon' | 'afternoon' | 'dusk' | 'evening' | 'late-night';

const SKILL_THRESHOLDS = [100, 300, 1000];
const SKILL_MAX_EXP = 1500;
const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const MOCK_WEATHER_TEMP_C: number | null = null;
const BASE_EFFECTS_PER_MINUTE = {
  hunger: -0.12,
  thirst: -0.18,
  happiness: -0.03,
  energy: -0.03,
  health: 0.01,
};
const AUTO_TRIGGER_THRESHOLD = {
  hunger: 30,
  thirst: 30,
  energy: 30,
  happiness: 50,
};

const PICK_DECISION_COOLDOWN_MS = 20 * 60 * 1000;
const PICK_PROBABILITY_POINTS: Record<
  Extract<AutoPickSource, 'hunger' | 'thirst' | 'happiness' | 'energy'>,
  Array<{ value: number; probability: number }>
> = {
  hunger: [
    { value: 50, probability: 0.05 },
    { value: 40, probability: 0.15 },
    { value: 30, probability: 0.6 },
    { value: 20, probability: 0.9 },
    { value: 10, probability: 0.97 },
    { value: 0, probability: 1 },
  ],
  thirst: [
    { value: 70, probability: 0.05 },
    { value: 50, probability: 0.2 },
    { value: 40, probability: 0.4 },
    { value: 30, probability: 0.6 },
    { value: 20, probability: 0.9 },
    { value: 10, probability: 0.99 },
    { value: 0, probability: 1 },
  ],
  happiness: [
    { value: 80, probability: 0.05 },
    { value: 50, probability: 0.2 },
    { value: 20, probability: 0.9 },
    { value: 0, probability: 1 },
  ],
  energy: [
    { value: 50, probability: 0.05 },
    { value: 30, probability: 0.3 },
    { value: 20, probability: 0.7 },
    { value: 10, probability: 0.9 },
    { value: 0, probability: 1 },
  ],
};

const DEFAULT_PET_ID = 'default-pet';
const TICK_INTERVAL_MS = 60 * 1000;
const DEFAULT_STATS = {
  name: '阿福',
  hunger: 80,
  hungerMax: 100,
  thirst: 70,
  thirstMax: 100,
  happiness: 75,
  happinessMax: 100,
  energy: 40,
  energyMax: 100,
  health: 100,
  healthMax: 100,
  warmth: 0,
  homeLat: null,
  homeLng: null,
  currentLat: null,
  currentLng: null,
  money: 100,
  calories: 0,
  weightKg: 50,
  teaEnergyBuffMinutes: 0,
  gojiHealthBuffMinutes: 0,
  gojiEnergyBuffMinutes: 0,
  reviveHealthBuffMinutes: 0,
  lastDailySettleDate: '',
};

interface TodoTemplate {
  kind: PetTodoKind;
  title: string;
  mode: PetTodoMode;
  totalMinutes: number;
  availablePeriods?: TimePeriod[];
  settleEveryMinutes?: number;
  minDurationMinutes?: number;
  hungerDelta: number;
  thirstDelta: number;
  happinessDelta: number;
  energyDelta: number;
  healthDelta: number;
  warmthDelta: number;
  moneyDelta: number;
  caloriesDelta?: number;
  teaEnergyBuffMinutes?: number;
  gojiHealthBuffMinutes?: number;
  gojiEnergyBuffMinutes?: number;
  hasSkill?: boolean;
}

type ShopItem = {
  itemId: string;
  name: string;
  description: string;
  price: number;
  equippable: boolean;
  sellRate: number;
  initialDurability: number;
  durabilityDailyDecay: number;
};

const SHOP_CATALOG: ShopItem[] = [
  {
    itemId: 'black-sweater',
    name: '黑色毛衣',
    description: '黑色针织毛衣，低于10°C时，天气的降温效果*50%，并自带+0.05/分钟升温。',
    price: 35,
    equippable: true,
    sellRate: 0.8,
    initialDurability: 100,
    durabilityDailyDecay: 0.2,
  },
  {
    itemId: 'revive-potion',
    name: '复活药水',
    description: '立即回复100健康，并赋予120分钟回复 buff（每分钟+1健康）。',
    price: 0,
    equippable: false,
    sellRate: 1,
    initialDurability: 0,
    durabilityDailyDecay: 0,
  },
];

const TODO_TEMPLATES: Record<PetTodoKind, TodoTemplate> = {
  'eat-oreo': {
    kind: 'eat-oreo',
    title: '奥利奥饼干',
    mode: 'finite',
    totalMinutes: 5,
    hungerDelta: 30,
    thirstDelta: -10,
    happinessDelta: 0,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: -8,
    caloriesDelta: 400,
  },
  'eat-cheese-beef-burger': {
    kind: 'eat-cheese-beef-burger',
    title: '芝士牛肉汉堡',
    mode: 'finite',
    totalMinutes: 15,
    hungerDelta: 60,
    thirstDelta: -5,
    happinessDelta: 10,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: -28,
    caloriesDelta: 800,
  },
  'eat-luosifen': {
    kind: 'eat-luosifen',
    title: '吃螺蛳粉',
    mode: 'finite',
    totalMinutes: 20,
    hungerDelta: 70,
    thirstDelta: -20,
    happinessDelta: 10,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: -18,
    caloriesDelta: 800,
  },
  'eat-sichuan-hotpot': {
    kind: 'eat-sichuan-hotpot',
    title: '四川火锅',
    mode: 'finite',
    totalMinutes: 45,
    availablePeriods: ['dusk', 'evening'],
    hungerDelta: 100,
    thirstDelta: -50,
    happinessDelta: 15,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 10,
    moneyDelta: -124,
    caloriesDelta: 1500,
  },
  'eat-bbq': {
    kind: 'eat-bbq',
    title: '烧烤',
    mode: 'finite',
    totalMinutes: 40,
    availablePeriods: ['evening', 'late-night'],
    hungerDelta: 80,
    thirstDelta: -40,
    happinessDelta: 10,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 4,
    moneyDelta: -115,
    caloriesDelta: 1400,
  },
  'eat-salad': {
    kind: 'eat-salad',
    title: '蔬菜沙拉',
    mode: 'finite',
    totalMinutes: 10,
    hungerDelta: 50,
    thirstDelta: 5,
    happinessDelta: -10,
    energyDelta: 0,
    healthDelta: 5,
    warmthDelta: 0,
    moneyDelta: -22,
    caloriesDelta: 200,
  },
  'eat-baozi': {
    kind: 'eat-baozi',
    title: '包子',
    mode: 'finite',
    totalMinutes: 8,
    availablePeriods: ['morning'],
    hungerDelta: 55,
    thirstDelta: 0,
    happinessDelta: 0,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: -5,
    caloriesDelta: 400,
  },
  'drink-water': {
    kind: 'drink-water',
    title: '水',
    mode: 'finite',
    totalMinutes: 1,
    hungerDelta: 0,
    thirstDelta: 30,
    happinessDelta: 0,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: -1,
    moneyDelta: 0,
  },
  'drink-hot-water': {
    kind: 'drink-hot-water',
    title: '热水',
    mode: 'finite',
    totalMinutes: 3,
    hungerDelta: 0,
    thirstDelta: 25,
    happinessDelta: 0,
    energyDelta: 0,
    healthDelta: 1,
    warmthDelta: 10,
    moneyDelta: 0,
  },
  'drink-cold-water': {
    kind: 'drink-cold-water',
    title: '冰水',
    mode: 'finite',
    totalMinutes: 2,
    hungerDelta: 0,
    thirstDelta: 35,
    happinessDelta: 1,
    energyDelta: 0,
    healthDelta: -0.2,
    warmthDelta: -10,
    moneyDelta: 0,
  },
  'drink-coffee': {
    kind: 'drink-coffee',
    title: '咖啡',
    mode: 'finite',
    totalMinutes: 10,
    availablePeriods: ['morning', 'forenoon', 'noon', 'afternoon'],
    hungerDelta: 0,
    thirstDelta: 20,
    happinessDelta: 0,
    energyDelta: 20,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: -15,
    caloriesDelta: 60,
  },
  'drink-tea': {
    kind: 'drink-tea',
    title: '绿茶',
    mode: 'finite',
    totalMinutes: 15,
    availablePeriods: ['morning', 'forenoon', 'noon', 'afternoon'],
    hungerDelta: 0,
    thirstDelta: 20,
    happinessDelta: 0,
    energyDelta: 10,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: -12,
    teaEnergyBuffMinutes: 150,
  },
  'drink-red-date-goji-tea': {
    kind: 'drink-red-date-goji-tea',
    title: '红枣枸杞茶',
    mode: 'finite',
    totalMinutes: 15,
    hungerDelta: 0,
    thirstDelta: 20,
    happinessDelta: 0,
    energyDelta: 5,
    healthDelta: 10,
    warmthDelta: 10,
    moneyDelta: -18,
    caloriesDelta: 50,
    gojiHealthBuffMinutes: 120,
    gojiEnergyBuffMinutes: 120,
  },
  'drink-ice-coconut-water': {
    kind: 'drink-ice-coconut-water',
    title: '冰椰子水',
    mode: 'finite',
    totalMinutes: 6,
    hungerDelta: 0,
    thirstDelta: 25,
    happinessDelta: 3,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: -4,
    moneyDelta: -10,
    caloriesDelta: 100,
  },
  'drink-hot-soymilk': {
    kind: 'drink-hot-soymilk',
    title: '热豆浆',
    mode: 'finite',
    totalMinutes: 6,
    hungerDelta: 0,
    thirstDelta: 25,
    happinessDelta: 0,
    energyDelta: 0,
    healthDelta: 0,
    warmthDelta: 10,
    moneyDelta: -4,
    caloriesDelta: 250,
  },
  'drink-ice-cream': {
    kind: 'drink-ice-cream',
    title: '冰淇淋',
    mode: 'finite',
    totalMinutes: 8,
    hungerDelta: 5,
    thirstDelta: 5,
    happinessDelta: 30,
    energyDelta: 0,
    healthDelta: -1,
    warmthDelta: -25,
    moneyDelta: -13,
    caloriesDelta: 500,
  },
  sleep: {
    kind: 'sleep',
    title: '睡觉',
    mode: 'ongoing',
    availablePeriods: ['noon', 'evening', 'late-night'],
    totalMinutes: 0,
    settleEveryMinutes: 1,
    minDurationMinutes: 60,
    hungerDelta: 0,
    thirstDelta: 0,
    happinessDelta: 0,
    energyDelta: 0.25,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: 0,
  },
  'watch-short-video': {
    kind: 'watch-short-video',
    title: '刷短视频',
    mode: 'ongoing',
    totalMinutes: 0,
    settleEveryMinutes: 1,
    minDurationMinutes: 10,
    hungerDelta: 0,
    thirstDelta: 0,
    happinessDelta: 0.15,
    energyDelta: -0.1,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: 0,
  },
  'play-genshin': {
    kind: 'play-genshin',
    title: '玩原神',
    mode: 'ongoing',
    totalMinutes: 0,
    settleEveryMinutes: 1,
    minDurationMinutes: 10,
    hungerDelta: 0,
    thirstDelta: 0,
    happinessDelta: 0.2,
    energyDelta: -0.12,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: 0,
  },
  'slow-jog': {
    kind: 'slow-jog',
    title: '慢跑',
    mode: 'ongoing',
    totalMinutes: 0,
    settleEveryMinutes: 1,
    minDurationMinutes: 10,
    hungerDelta: -0.4,
    thirstDelta: 0,
    happinessDelta: 0,
    energyDelta: 0.1,
    healthDelta: 0.1,
    warmthDelta: 0,
    moneyDelta: 0,
    caloriesDelta: -5,
  },
  'work-code': {
    kind: 'work-code',
    title: '写代码',
    mode: 'ongoing',
    totalMinutes: 0,
    settleEveryMinutes: 1,
    minDurationMinutes: 30,
    hungerDelta: 0,
    thirstDelta: 0,
    happinessDelta: -0.1,
    energyDelta: -0.3,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: 0,
    hasSkill: true,
  },
  'work-live': {
    kind: 'work-live',
    title: '做直播',
    mode: 'ongoing',
    totalMinutes: 0,
    settleEveryMinutes: 1,
    minDurationMinutes: 30,
    hungerDelta: 0,
    thirstDelta: 0,
    happinessDelta: -0.2,
    energyDelta: -0.1,
    healthDelta: 0,
    warmthDelta: 0,
    moneyDelta: 0,
    hasSkill: true,
  },
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

@Schema({ timestamps: true, collection: 'pet-stats' })
export class PetStats extends MongooseDocument {
  @Prop({ required: true, unique: true }) petId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, default: 80 }) hunger: number;
  @Prop({ required: true, default: 100 }) hungerMax: number;
  @Prop({ required: true, default: 70 }) thirst: number;
  @Prop({ required: true, default: 100 }) thirstMax: number;
  @Prop({ required: true, default: 75 }) happiness: number;
  @Prop({ required: true, default: 100 }) happinessMax: number;
  @Prop({ required: true, default: 40 }) energy: number;
  @Prop({ required: true, default: 100 }) energyMax: number;
  @Prop({ required: true, default: 100 }) health: number;
  @Prop({ required: true, default: 100 }) healthMax: number;
  @Prop({ required: true, default: 0 }) warmth: number;
  @Prop({ default: null }) homeLat: number | null;
  @Prop({ default: null }) homeLng: number | null;
  @Prop({ default: null }) currentLat: number | null;
  @Prop({ default: null }) currentLng: number | null;
  @Prop({ required: true, default: 100 }) money: number;
  @Prop({ required: true, default: 0 }) calories: number;
  @Prop({ required: true, default: 50 }) weightKg: number;
  @Prop({ required: true, default: 0 }) teaEnergyBuffMinutes: number;
  @Prop({ required: true, default: 0 }) gojiHealthBuffMinutes: number;
  @Prop({ required: true, default: 0 }) gojiEnergyBuffMinutes: number;
  @Prop({ required: true, default: 0 }) reviveHealthBuffMinutes: number;
  @Prop({ default: '' }) lastDailySettleDate: string;
}

@Schema({ timestamps: true, collection: 'pet-things' })
export class PetThing extends MongooseDocument {
  @Prop({ required: true }) petId: string;
  @Prop({ required: true }) itemId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, default: '' }) description: string;
  @Prop({ required: true, default: 0 }) price: number;
  @Prop({ required: true, default: false }) equippable: boolean;
  @Prop({ required: true, default: 1 }) sellRate: number;
  @Prop({ required: true, default: false }) equipped: boolean;
  @Prop({ required: true, default: 0 }) durability: number;
  @Prop({ required: true, default: 0 }) durabilityDailyDecay: number;
  @Prop({ required: true, default: 0 }) count: number;
}

@Schema({ timestamps: true, collection: 'pet-todos' })
export class PetTodo extends MongooseDocument {
  @Prop({ required: true }) petId: string;
  @Prop({ required: true }) kind: PetTodoKind;
  @Prop({ required: true }) title: string;
  @Prop({ required: true, default: 'finite' }) mode: PetTodoMode;
  @Prop({ required: true }) source: 'auto' | 'manual';
  @Prop({ required: true, default: 'running' }) status: PetTodoStatus;
  @Prop({ required: true, default: 0 }) elapsedMinutes: number;
  @Prop({ required: true }) totalMinutes: number;
  @Prop({ default: 1 }) settleEveryMinutes?: number;
  @Prop({ required: true, default: 0 }) minDurationMinutes: number;
  @Prop({ required: true }) hungerDelta: number;
  @Prop({ required: true }) thirstDelta: number;
  @Prop({ required: true }) happinessDelta: number;
  @Prop({ required: true }) energyDelta: number;
  @Prop({ required: true, default: 0 }) healthDelta: number;
  @Prop({ required: true, default: 0 }) warmthDelta: number;
  @Prop({ required: true }) moneyDelta: number;
  @Prop({ required: true, default: false }) hasSkill: boolean;
  @Prop({ required: true, default: 0 }) skillExp: number;
  @Prop({ required: true, default: 1 }) skillLevel: number;
  @Prop({ required: true, default: 0 }) caloriesDelta: number;
  @Prop({ required: true, default: 0 }) teaEnergyBuffMinutes: number;
  @Prop({ required: true, default: 0 }) gojiHealthBuffMinutes: number;
  @Prop({ required: true, default: 0 }) gojiEnergyBuffMinutes: number;
  @Prop({ default: null }) pickedBy?: AutoPickSource | null;
  @Prop() startedAt?: Date;
  @Prop() endedAt?: Date;
}

@Schema({ timestamps: true, collection: 'pet-records' })
export class PetRecord extends MongooseDocument {
  @Prop({ required: true }) petId: string;
  @Prop({ required: true }) type: 'start' | 'progress' | 'complete' | 'interrupt' | 'system';
  @Prop({ required: true }) message: string;
  @Prop({ default: '' }) reason: string;
  @Prop() todoId?: string;
  @Prop({ required: true, default: Date.now }) happenedAt: Date;
}

@Schema({ timestamps: true, collection: 'pet-locations' })
export class PetLocation extends MongooseDocument {
  @Prop({ required: true }) petId: string;
  @Prop({ required: true }) lat: number;
  @Prop({ required: true }) lng: number;
  @Prop({ required: true, default: 1 }) count: number;
  @Prop({ required: true, default: 'track' }) source: 'track' | 'home';
  @Prop({ required: true, default: Date.now }) happenedAt: Date;
}

type InjuryStatus = {
  key: string;
  label: '轻度不适' | '严重不适' | '轻伤' | '重伤';
  source: string;
  damagePerMinute: number;
};

type TravelInfo = {
  type: 'none' | 'short' | 'medium' | 'long';
  distanceKm: number;
  effects: {
    hungerDelta: number;
    thirstDelta: number;
    energyDelta: number;
    happinessDelta: number;
  };
};

type WeatherInfo = {
  text: string;
  temperatureC: number | null;
  effects: {
    hungerDelta: number;
    thirstDelta: number;
    warmthDelta: number;
  };
};

type StatusEffectReason = {
  source: string;
  deltaPerMinute: number;
};

type StatusEffects = {
  hunger: StatusEffectReason[];
  thirst: StatusEffectReason[];
  happiness: StatusEffectReason[];
  energy: StatusEffectReason[];
  health: StatusEffectReason[];
  warmth: StatusEffectReason[];
  money: StatusEffectReason[];
};

type AutoTodoPlan = {
  kind: PetTodoKind;
  reason?: string;
  pickedBy?: AutoPickSource;
};

type PickDecision = {
  shouldPick: boolean;
  probability: number;
};

type WeightedPickItem = {
  kind: PetTodoKind;
  title: string;
  weight: number;
};

type WeightedPickResult = {
  kind: PetTodoKind;
  weight: number;
  rankedWeights: WeightedPickItem[];
  continued?: boolean;
};

export const PetStatsSchema = SchemaFactory.createForClass(PetStats);
export const PetThingSchema = SchemaFactory.createForClass(PetThing);
export const PetTodoSchema = SchemaFactory.createForClass(PetTodo);
export const PetRecordSchema = SchemaFactory.createForClass(PetRecord);
export const PetLocationSchema = SchemaFactory.createForClass(PetLocation);

@Injectable()
export class PetService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private dailyTimer: NodeJS.Timeout | null = null;
  private lastDecayDate = '';
  private weatherCache = new Map<string, { expiresAt: number; data: WeatherInfo }>();
  private pickDecisionCooldownUntil = new Map<
    Extract<AutoPickSource, 'hunger' | 'thirst' | 'happiness' | 'energy'>,
    number
  >();

  constructor(
    @InjectModel(PetStats.name) private petStatsModel: Model<PetStats>,
    @InjectModel(PetThing.name) private petThingModel: Model<PetThing>,
    @InjectModel(PetTodo.name) private petTodoModel: Model<PetTodo>,
    @InjectModel(PetRecord.name) private petRecordModel: Model<PetRecord>,
    @InjectModel(PetLocation.name) private petLocationModel: Model<PetLocation>,
  ) {}

  async onModuleInit() {
    this.validateTodoTemplates();
    await this.ensurePet(DEFAULT_PET_ID);
    this.timer = setInterval(() => {
      void this.tickAllPets().catch((error) => {
        console.error('[PetService] tickAllPets failed:', error);
      });
    }, TICK_INTERVAL_MS);
    this.dailyTimer = setInterval(() => {
      void this.runDailyDecayIfNeeded().catch((error) => {
        console.error('[PetService] runDailyDecayIfNeeded failed:', error);
      });
    }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.dailyTimer) {
      clearInterval(this.dailyTimer);
      this.dailyTimer = null;
    }
  }

  private validateTodoTemplates() {
    for (const template of Object.values(TODO_TEMPLATES)) {
      if (template.mode !== 'ongoing') {
        continue;
      }
      if (!Number.isFinite(template.minDurationMinutes) || (template.minDurationMinutes || 0) <= 0) {
        throw new Error(`Missing minDurationMinutes for ongoing todo: ${template.kind}`);
      }
    }
  }

  private getDateKey(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  private getBeijingMinutes(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
    return hour * 60 + minute;
  }

  private getTimePeriodByBeijing(date = new Date()) {
    const totalMinutes = this.getBeijingMinutes(date);
    if (totalMinutes >= 6 * 60 && totalMinutes < 9 * 60) return 'morning';
    if (totalMinutes >= 9 * 60 && totalMinutes < 11 * 60 + 30) return 'forenoon';
    if (totalMinutes >= 11 * 60 + 30 && totalMinutes < 13 * 60 + 30) return 'noon';
    if (totalMinutes >= 13 * 60 + 30 && totalMinutes < 17 * 60) return 'afternoon';
    if (totalMinutes >= 17 * 60 && totalMinutes < 19 * 60) return 'dusk';
    if (totalMinutes >= 19 * 60 && totalMinutes < 24 * 60) return 'evening';
    return 'late-night';
  }

  private canSleepNow(date = new Date()) {
    const period = this.getTimePeriodByBeijing(date);
    return period === 'noon' || period === 'evening' || period === 'late-night';
  }

  private isTodoAvailableAt(kind: PetTodoKind, date = new Date()) {
    if (kind === 'sleep') {
      return this.canSleepNow(date);
    }
    const template = TODO_TEMPLATES[kind];
    if (!template) {
      return false;
    }
    if (!template.availablePeriods?.length) {
      return true;
    }
    return template.availablePeriods.includes(this.getTimePeriodByBeijing(date));
  }

  private getInterpolatedProbability(
    value: number,
    points: Array<{ value: number; probability: number }>,
  ) {
    if (!points.length) {
      return 0;
    }

    const sorted = [...points].sort((a, b) => b.value - a.value);
    if (value >= sorted[0].value) {
      return sorted[0].probability;
    }
    if (value <= sorted[sorted.length - 1].value) {
      return sorted[sorted.length - 1].probability;
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const upper = sorted[i];
      const lower = sorted[i + 1];
      if (value <= upper.value && value >= lower.value) {
        const ratio = (upper.value - value) / (upper.value - lower.value);
        return upper.probability + (lower.probability - upper.probability) * ratio;
      }
    }

    return 0;
  }

  private pickThisTodoKind(
    source: Extract<AutoPickSource, 'hunger' | 'thirst' | 'happiness' | 'energy'>,
    value: number,
  ): PickDecision {
    const now = Date.now();
    const cooldownUntil = Number(this.pickDecisionCooldownUntil.get(source) || 0);
    if (cooldownUntil > now) {
      return { shouldPick: false, probability: 0 };
    }

    const points = PICK_PROBABILITY_POINTS[source];
    const probability = this.getInterpolatedProbability(Number(value || 0), points);
    const shouldPick = Math.random() < probability;

    if (!shouldPick) {
      this.pickDecisionCooldownUntil.set(source, now + PICK_DECISION_COOLDOWN_MS);
    } else {
      this.pickDecisionCooldownUntil.delete(source);
    }

    return { shouldPick, probability };
  }

  private buildAutoPickReason(metricLabel: string, value: number, probability: number, todoTitle: string) {
    const metricValue = round2(Number(value || 0));
    const probabilityText = `${round2(Math.max(0, Math.min(1, probability)) * 100)}%`;
    return `${metricLabel}${metricValue}，有${probabilityText}概率做${todoTitle}，判定成功`;
  }

  private getWorkMoneyBasePerMinute(todo: Pick<PetTodo, 'kind' | 'skillExp'>) {
    const level = this.getLevelByExp(Number(todo.skillExp || 0));
    if (todo.kind === 'work-code') {
      return level === 1 ? 3 : level === 2 ? 4 : 6;
    }
    if (todo.kind === 'work-live') {
      return level === 1 ? 1 : level === 2 ? 1.5 : 3;
    }
    return 0;
  }

  private getWorkMoneyMultiplier(stats: Pick<PetStats, 'energy' | 'health'>) {
    let multiplier = 1;
    const energy = Number(stats.energy || 0);
    const health = Number(stats.health || 0);

    if (energy > 70) {
      multiplier *= 1.2;
    } else if (energy < 30) {
      multiplier *= 0.8;
    }

    if (health < 10) {
      multiplier *= 0.2;
    } else if (health < 30) {
      multiplier *= 0.5;
    } else if (health < 50) {
      multiplier *= 0.8;
    }

    return round2(multiplier);
  }

  private getLowHappinessHealthDelta(happiness: number) {
    if (happiness < 30) {
      return round2(-(30 - happiness) * 0.01);
    }
    return 0;
  }

  private getWarmthWeightDelta(currentWarmth: number, itemWarmth: number) {
    const current = Number(currentWarmth || 0);
    const item = Number(itemWarmth || 0);
    if (!current || !item) {
      return 0;
    }

    const sameDirection = (current > 0 && item > 0) || (current < 0 && item < 0);
    const total = Math.abs(current) + Math.abs(item);
    return round2((sameDirection ? -1 : 1) * total * 0.02);
  }

  private getCaloricWeightDelta(currentWeightKg: number, caloriesDelta: number, satietyGain: number) {
    const weight = Number(currentWeightKg || 0);
    const calories = Number(caloriesDelta || 0);
    const satiety = Number(satietyGain || 0);
    if (!calories || satiety <= 0) {
      return 0;
    }

    const caloricScore = calories / satiety / 10 - 1;
    if (weight > 55) {
      return round2(-(weight - 55) * caloricScore * 0.1);
    }
    if (weight < 45) {
      return round2((45 - weight) * caloricScore * 0.1);
    }
    return 0;
  }

  private getHungerWeightMultiplier(currentHunger: number, hungerDelta: number) {
    const projectedHunger = Number(currentHunger || 0) + Number(hungerDelta || 0);
    if (projectedHunger > 120) {
      return 0.01;
    }
    if (projectedHunger > 100) {
      return 0.2;
    }
    if (projectedHunger >= 90 || projectedHunger < 80) {
      return 0.8;
    }
    return 1;
  }

  private buildDetailedAutoPickReason(
    metricLabel: string,
    value: number,
    probability: number,
    actionLabel: string,
    selectedTitle: string,
    selectedWeight: number,
    rankedWeights: WeightedPickItem[],
    continued = false,
  ) {
    if (metricLabel === '工作') {
      return '进行工作';
    }

    const metricValue = round2(Number(value || 0));
    const probabilityText = `${round2(Math.max(0, Math.min(1, probability)) * 100)}%`;
    if (continued) {
      return [
        `事项类型：${metricLabel}${metricValue}，有${probabilityText}概率做${actionLabel}，判定成功`,
        '权重：继续上次事项',
        `选中事项：${selectedTitle} ${round2(selectedWeight)}`,
      ].join('\n');
    }

    const topWeights = rankedWeights.slice(0, 5);
    const weightLines = topWeights.length
      ? topWeights.map((item, index) => `${index + 1}. ${item.title} ${round2(item.weight)}`)
      : ['无'];
    return [
      `事项类型：${metricLabel}${metricValue}，有${probabilityText}概率做${actionLabel}，判定成功`,
      '权重：',
      ...weightLines,
      `选中事项：${selectedTitle} ${round2(selectedWeight)}`,
    ].join('\n');
  }

  private selectWeightedPick(weights: Map<PetTodoKind, number>): WeightedPickResult {
    const rankedWeights = Array.from(weights.entries())
      .filter(([, weight]) => weight > 0)
      .map(([kind, weight]) => ({ kind, title: TODO_TEMPLATES[kind].title, weight }))
      .sort((a, b) => b.weight - a.weight);

    if (!rankedWeights.length) {
      const fallbackKind = Object.keys(TODO_TEMPLATES)[0] as PetTodoKind;
      return {
        kind: fallbackKind,
        weight: 0,
        rankedWeights: [],
      };
    }

    const totalWeight = rankedWeights.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of rankedWeights) {
      random -= item.weight;
      if (random <= 0) {
        return {
          kind: item.kind,
          weight: item.weight,
          rankedWeights,
        };
      }
    }

    const selected = rankedWeights[0];
    return {
      kind: selected.kind,
      weight: selected.weight,
      rankedWeights,
    };
  }

  private async runDailyDecayIfNeeded() {
    const now = new Date();
    const today = this.getDateKey(now);
    if (this.lastDecayDate === today) {
      return;
    }

    this.lastDecayDate = today;
    await this.applyDailyExpDecay();
  }

  private async applyDailyExpDecay() {
    const today = this.getDateKey(new Date());
    const allStats = await this.petStatsModel.find({}).lean().exec();
    for (const stats of allStats) {
      if ((stats as any).lastDailySettleDate === today) {
        continue;
      }

      const petId = stats.petId;
      const calories = Number((stats as any).calories || 0);
      const prevWeight = Number((stats as any).weightKg || 50);
      const offset = calories - 2000;
      const steps = Math.floor(Math.abs(offset) / 7);
      const weightDelta = steps * 0.001 * (offset >= 0 ? 1 : -1);
      const nextWeight = round3(prevWeight + weightDelta);

      await this.petStatsModel
        .updateOne(
          { petId },
          {
            $set: {
              calories: 0,
              weightKg: nextWeight,
              lastDailySettleDate: today,
            },
          },
        )
        .exec();

      for (const kind of ['work-code', 'work-live'] as const) {
        const latest = await this.petTodoModel
          .findOne({ petId, kind, hasSkill: true })
          .sort({ createdAt: -1 })
          .exec();
        if (!latest) {
          continue;
        }

        this.normalizeTodoFields(latest);
        latest.skillExp = Math.max(0, latest.skillExp - 10);
        latest.skillLevel = this.getLevelByExp(latest.skillExp);
        await latest.save();
      }

      const equippedThings = await this.petThingModel
        .find({
          petId,
          equipped: true,
          durabilityDailyDecay: { $gt: 0 },
          durability: { $gt: 0 },
        })
        .exec();

      for (const thing of equippedThings) {
        const decay = Math.max(0, Number(thing.durabilityDailyDecay || 0));
        if (!decay) {
          continue;
        }
        thing.durability = round2(Math.max(0, Number(thing.durability || 0) - decay));
        await thing.save();
      }

      await this.petRecordModel.create({
        petId,
        type: 'system',
        message: `日结 卡${round2(calories)} 体重${weightDelta >= 0 ? '+' : ''}${round3(weightDelta)}kg 技能-10 已衰减装备耐久`,
        happenedAt: new Date(),
      });
    }
  }

  private async ensurePet(petId: string) {
    const exists = await this.petStatsModel.findOne({ petId }).exec();
    if (!exists) {
      await this.petStatsModel.create({
        petId,
        ...DEFAULT_STATS,
      });
      await this.petRecordModel.create({
        petId,
        type: 'start',
        message: '桌宠已创建',
        happenedAt: new Date(),
      });
      return;
    }

    let changed = false;
    if (typeof exists.hungerMax !== 'number' || exists.hungerMax !== 100) {
      exists.hungerMax = 100;
      changed = true;
    }
    if (typeof exists.thirstMax !== 'number' || exists.thirstMax !== 100) {
      exists.thirstMax = 100;
      changed = true;
    }
    if (typeof exists.happinessMax !== 'number') {
      exists.happinessMax = 100;
      changed = true;
    }
    const maybeExists = exists as any;
    if (typeof exists.energy !== 'number') {
      exists.energy = typeof maybeExists.sleep === 'number' ? maybeExists.sleep : 40;
      changed = true;
    }
    if (typeof exists.energyMax !== 'number') {
      exists.energyMax =
        typeof maybeExists.sleepMax === 'number' ? maybeExists.sleepMax : 100;
      changed = true;
    }
    if (typeof exists.health !== 'number') {
      exists.health = 100;
      changed = true;
    }
    if (typeof exists.healthMax !== 'number' || exists.healthMax !== 100) {
      exists.healthMax = 100;
      changed = true;
    }
    if (typeof exists.warmth !== 'number') {
      exists.warmth = 0;
      changed = true;
    }
    if (typeof exists.homeLat !== 'number' && exists.homeLat !== null) {
      exists.homeLat = null;
      changed = true;
    }
    if (typeof exists.homeLng !== 'number' && exists.homeLng !== null) {
      exists.homeLng = null;
      changed = true;
    }
    if (typeof exists.currentLat !== 'number' && exists.currentLat !== null) {
      exists.currentLat = null;
      changed = true;
    }
    if (typeof exists.currentLng !== 'number' && exists.currentLng !== null) {
      exists.currentLng = null;
      changed = true;
    }
    if (typeof (exists as any).calories !== 'number') {
      (exists as any).calories = 0;
      changed = true;
    }
    if (typeof (exists as any).weightKg !== 'number') {
      (exists as any).weightKg = 50;
      changed = true;
    }
    if (typeof (exists as any).teaEnergyBuffMinutes !== 'number') {
      (exists as any).teaEnergyBuffMinutes = 0;
      changed = true;
    }
    if (typeof (exists as any).gojiHealthBuffMinutes !== 'number') {
      (exists as any).gojiHealthBuffMinutes = 0;
      changed = true;
    }
    if (typeof (exists as any).gojiEnergyBuffMinutes !== 'number') {
      (exists as any).gojiEnergyBuffMinutes = 0;
      changed = true;
    }
    if (typeof (exists as any).reviveHealthBuffMinutes !== 'number') {
      (exists as any).reviveHealthBuffMinutes = 0;
      changed = true;
    }
    if (typeof (exists as any).lastDailySettleDate !== 'string') {
      (exists as any).lastDailySettleDate = '';
      changed = true;
    }
    if (changed) {
      await exists.save();
    }

    await this.backfillTodoFields(petId);
  }

  private async backfillTodoFields(petId: string) {
    await this.petTodoModel
      .updateMany(
        { petId, energyDelta: { $exists: false }, kind: 'sleep' },
        { $set: { energyDelta: 0.25 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, kind: 'sleep', energyDelta: { $in: [1, 0.01] } },
        { $set: { energyDelta: 0.25 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, energyDelta: { $exists: false }, kind: 'work-code' },
        { $set: { energyDelta: -0.3 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, energyDelta: { $exists: false }, kind: 'work-live' },
        { $set: { energyDelta: -0.1 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, kind: 'work-code', energyDelta: { $in: [-3] } },
        { $set: { energyDelta: -0.3 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, kind: 'work-live', energyDelta: { $in: [-1] } },
        { $set: { energyDelta: -0.1 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, kind: 'work-code', happinessDelta: { $in: [-1] } },
        { $set: { happinessDelta: -0.1 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, kind: 'work-live', happinessDelta: { $in: [-2] } },
        { $set: { happinessDelta: -0.2 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, energyDelta: { $exists: false } },
        { $set: { energyDelta: 0 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, healthDelta: { $exists: false } },
        { $set: { healthDelta: 0 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, warmthDelta: { $exists: false } },
        { $set: { warmthDelta: 0 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany({ petId, hasSkill: { $exists: false } }, { $set: { hasSkill: false } })
      .exec();
    await this.petTodoModel
      .updateMany({ petId, skillExp: { $exists: false } }, { $set: { skillExp: 0 } })
      .exec();
    await this.petTodoModel
      .updateMany({ petId, skillLevel: { $exists: false } }, { $set: { skillLevel: 1 } })
      .exec();
    const ongoingTodoKinds: PetTodoKind[] = ['sleep', 'watch-short-video', 'play-genshin', 'slow-jog', 'work-code', 'work-live'];
    for (const kind of ongoingTodoKinds) {
      const minDurationMinutes = Number(TODO_TEMPLATES[kind]?.minDurationMinutes || 0);
      await this.petTodoModel
        .updateMany(
          {
            petId,
            kind,
            $or: [{ minDurationMinutes: { $exists: false } }, { minDurationMinutes: 0 }],
          },
          {
            $set: {
              minDurationMinutes,
            },
          },
        )
        .exec();
    }
    await this.petTodoModel
      .updateMany({ petId, caloriesDelta: { $exists: false } }, { $set: { caloriesDelta: 0 } })
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, teaEnergyBuffMinutes: { $exists: false } },
        { $set: { teaEnergyBuffMinutes: 0 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, gojiHealthBuffMinutes: { $exists: false } },
        { $set: { gojiHealthBuffMinutes: 0 } },
      )
      .exec();
    await this.petTodoModel
      .updateMany(
        { petId, gojiEnergyBuffMinutes: { $exists: false } },
        { $set: { gojiEnergyBuffMinutes: 0 } },
      )
      .exec();

    await this.petThingModel
      .updateMany({ petId, description: { $exists: false } }, { $set: { description: '' } })
      .exec();
    await this.petThingModel
      .updateMany({ petId, price: { $exists: false } }, { $set: { price: 0 } })
      .exec();
    await this.petThingModel
      .updateMany({ petId, equippable: { $exists: false } }, { $set: { equippable: false } })
      .exec();
    await this.petThingModel
      .updateMany({ petId, sellRate: { $exists: false } }, { $set: { sellRate: 1 } })
      .exec();
    await this.petThingModel
      .updateMany({ petId, equipped: { $exists: false } }, { $set: { equipped: false } })
      .exec();
    await this.petThingModel
      .updateMany({ petId, durability: { $exists: false } }, { $set: { durability: 0 } })
      .exec();
    await this.petThingModel
      .updateMany(
        { petId, durabilityDailyDecay: { $exists: false } },
        { $set: { durabilityDailyDecay: 0 } },
      )
      .exec();
    await this.petThingModel
      .updateMany({ petId, equippable: true, count: { $gt: 1 } }, { $set: { count: 1 } })
      .exec();
    await this.petThingModel
      .updateMany(
        { petId, itemId: 'black-sweater' },
        { $set: { sellRate: 0.8, durabilityDailyDecay: 0.2 } },
      )
      .exec();
    await this.petThingModel
      .updateMany(
        { petId, itemId: 'black-sweater', durability: { $lte: 0 } },
        { $set: { durability: 100 } },
      )
      .exec();
  }

  async getSnapshot(petId = DEFAULT_PET_ID) {
    await this.ensurePet(petId);
    await this.ensureRunningTodo(petId);
    const stats = await this.petStatsModel.findOne({ petId }).lean().exec();
    const latestSkillTodos = await this.petTodoModel
      .find({ petId, hasSkill: true })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const skillMap = new Map<string, ReturnType<PetService['buildSkillView']>>();
    for (const todo of latestSkillTodos) {
      if (skillMap.has(todo.kind)) {
        continue;
      }
      skillMap.set(todo.kind, this.buildSkillView(todo.skillExp || 0));
    }
    const things = await this.petThingModel.find({ petId }).sort({ createdAt: 1 }).lean().exec();
    const hasEquippedBlackSweater = things.some(
      (thing) => thing.itemId === 'black-sweater' && thing.equipped,
    );
    const currentTodo = await this.petTodoModel
      .findOne({ petId, status: 'running' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const injuries = this.getInjuryStatuses(stats);
    const travel = this.getTravelInfo(stats);
    const weather = await this.getWeatherInfo(stats);
    const statusEffects = this.buildStatusEffects(
      stats,
      currentTodo,
      travel,
      injuries,
      weather,
      hasEquippedBlackSweater,
    );
    const records = await this.petRecordModel
      .find({ petId })
      .sort({ happenedAt: -1 })
      .limit(50)
      .lean()
      .exec();
    const locations = await this.petLocationModel
      .find({ petId })
      .sort({ happenedAt: -1 })
      .limit(1000)
      .lean()
      .exec();

    const toActionOption = (
      kind: PetTodoKind,
      effects: string,
      skill?: ReturnType<PetService['buildSkillView']>,
    ) => {
      const template = TODO_TEMPLATES[kind];
      return {
        kind,
        title: template.title,
        totalMinutes: template.totalMinutes,
        mode: template.mode,
        effects,
        availablePeriods: template.availablePeriods || [],
        settleEveryMinutes: template.settleEveryMinutes || 1,
        minDurationMinutes: template.minDurationMinutes || 0,
        skill,
      };
    };

    const actionCatalog: Array<{
      key: string;
      title: string;
      options: Array<{
        kind: PetTodoKind;
        title: string;
        totalMinutes: number;
        mode: 'finite' | 'ongoing';
        effects: string;
        availablePeriods: TimePeriod[];
        settleEveryMinutes: number;
        minDurationMinutes?: number;
        skill?: ReturnType<PetService['buildSkillView']>;
      }>;
    }> = [
      {
        key: 'eat',
        title: '吃',
        options: [
          toActionOption('eat-oreo', '+400卡 +30饱 -10水 -8元'),
          toActionOption('eat-cheese-beef-burger', '+800卡 +60饱 -5水 +10快乐 -28元'),
          toActionOption('eat-luosifen', '+800卡 +70饱 -20水 +10快乐 -18元'),
          toActionOption('eat-sichuan-hotpot', '+1500卡 +100饱 -50水 +15快乐 -124元'),
          toActionOption('eat-bbq', '+1400卡 +80饱 -40水 +10快乐 -115元'),
          toActionOption('eat-salad', '+200卡 +50饱 +5水 +5健康 -10快乐 -22元'),
          toActionOption('eat-baozi', '+400卡 +55饱 -5元'),
        ],
      },
      {
        key: 'drink',
        title: '喝',
        options: [
          toActionOption('drink-water', '+30水 -1冷暖'),
          toActionOption('drink-hot-water', '+25水 +1健康 +10冷暖'),
          toActionOption('drink-cold-water', '+35水 +1快乐 -0.2健康 -10冷暖'),
          toActionOption('drink-coffee', '-15元 +60卡 +20水 +20精力'),
          toActionOption('drink-tea', '-12元 +20水 +10精力 +0.1精力(150分钟)'),
          toActionOption('drink-red-date-goji-tea', '-18元 +50卡 +20水 +10健康 +5精力 +10冷暖 +120分钟健康buff +120分钟精力buff'),
          toActionOption('drink-ice-coconut-water', '-10元 +100卡 +25水 +3快乐'),
          toActionOption('drink-hot-soymilk', '-4元 +250卡 +25水 +10冷暖'),
          toActionOption('drink-ice-cream', '-13元 +500卡 +5饱 +5水 +30快乐 -1健康 -25冷暖'),
        ],
      },
      {
        key: 'fun',
        title: '休闲',
        options: [
          toActionOption('sleep', '+0.25精力'),
          toActionOption('watch-short-video', '-0.1精力 +0.15快乐'),
          toActionOption('play-genshin', '-0.12精力 +0.2快乐'),
          toActionOption('slow-jog', '-5卡 -0.4饱度 +0.1精力 +0.1健康'),
        ],
      },
      {
        key: 'work',
        title: '工作',
        options: [
          toActionOption('work-live', '-0.2快乐 -0.1精力', skillMap.get('work-live') || this.buildSkillView(0)),
          toActionOption('work-code', '-0.1快乐 -0.3精力', skillMap.get('work-code') || this.buildSkillView(0)),
        ],
      },
    ];

    return {
      petId,
      stats,
      injuries,
      travel,
      weather,
      statusEffects,
      things,
      shopCatalog: SHOP_CATALOG,
      locations: locations.reverse(),
      currentTodo,
      records: records.reverse(),
      actionCatalog,
    };
  }

  private buildSkillView(exp: number) {
    const level = this.getLevelByExp(exp);
    const maxExp = SKILL_MAX_EXP;
    const progress = Math.min(100, Math.round((exp / maxExp) * 100));
    const marks = SKILL_THRESHOLDS.map((threshold) =>
      Math.min(100, Math.round((threshold / maxExp) * 100)),
    );

    return {
      level,
      exp,
      maxExp,
      progress,
      marks,
    };
  }

  private getLevelByExp(exp: number) {
    if (exp >= SKILL_THRESHOLDS[2]) {
      return 3;
    }
    if (exp >= SKILL_THRESHOLDS[1]) {
      return 2;
    }
    return 1;
  }

  private async ensureRunningTodo(petId: string) {
    const runningTodo = await this.petTodoModel
      .findOne({ petId, status: 'running' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (runningTodo) {
      return;
    }

    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats) {
      return;
    }

    const plan = await this.pickAutoTodoPlan(stats);
    await this.triggerTodo(plan.kind, 'auto', petId, plan.reason, plan.pickedBy);
  }

  private async pickAutoTodoPlan(stats: PetStats): Promise<AutoTodoPlan> {
    const hungerDecision = this.pickThisTodoKind('hunger', stats.hunger);
    if (hungerDecision.shouldPick) {
      const pick = await this.pickFoodTodoKind(stats.petId);
      return {
        kind: pick.kind,
        reason: this.buildDetailedAutoPickReason(
          '饱度',
          stats.hunger,
          hungerDecision.probability,
          '吃',
          TODO_TEMPLATES[pick.kind].title,
          pick.weight,
          pick.rankedWeights,
        ),
        pickedBy: 'hunger',
      };
    }

    const thirstDecision = this.pickThisTodoKind('thirst', stats.thirst);
    if (thirstDecision.shouldPick) {
      const pick = await this.pickDrinkTodoKind(stats.petId);
      return {
        kind: pick.kind,
        reason: this.buildDetailedAutoPickReason(
          '渴度',
          stats.thirst,
          thirstDecision.probability,
          '喝',
          TODO_TEMPLATES[pick.kind].title,
          pick.weight,
          pick.rankedWeights,
        ),
        pickedBy: 'thirst',
      };
    }

    const energyDecision = this.pickThisTodoKind('energy', stats.energy);
    if (energyDecision.shouldPick) {
      const pick = await this.pickBySourceWithContinuation(
        stats.petId,
        'energy',
        () => this.pickEnergyTodoKind(),
      );
      return {
        kind: pick.kind,
        reason: this.buildDetailedAutoPickReason(
          '精力',
          stats.energy,
          energyDecision.probability,
          '休息',
          TODO_TEMPLATES[pick.kind].title,
          pick.weight,
          pick.rankedWeights,
          pick.continued,
        ),
        pickedBy: 'energy',
      };
    }

    const happinessDecision = this.pickThisTodoKind('happiness', stats.happiness);
    if (happinessDecision.shouldPick) {
      const pick = await this.pickBySourceWithContinuation(
        stats.petId,
        'happiness',
        () => this.pickHappinessTodoKind(),
      );
      return {
        kind: pick.kind,
        reason: this.buildDetailedAutoPickReason(
          '快乐',
          stats.happiness,
          happinessDecision.probability,
          '休息',
          TODO_TEMPLATES[pick.kind].title,
          pick.weight,
          pick.rankedWeights,
          pick.continued,
        ),
        pickedBy: 'happiness',
      };
    }

    const willWork = stats.hunger > 50 && stats.thirst > 50 && stats.energy > 50;

    if (willWork) {
      const pick = await this.pickBySourceWithContinuation(
        stats.petId,
        'work',
        () => this.pickWorkTodoKind(stats.petId),
      );
      return {
        kind: pick.kind,
        reason: this.buildDetailedAutoPickReason(
          '工作',
          stats.hunger,
          1,
          '工作',
          TODO_TEMPLATES[pick.kind].title,
          pick.weight,
          pick.rankedWeights,
          pick.continued,
        ),
        pickedBy: 'work',
      };
    }

    const pick = await this.pickLeisureTodoKind(stats.petId, stats);
    return {
      kind: pick.kind,
      reason: this.buildDetailedAutoPickReason(
        '休息',
        stats.hunger,
        1,
        '休息',
        TODO_TEMPLATES[pick.kind].title,
        pick.weight,
        pick.rankedWeights,
      ),
      pickedBy: 'leisure',
    };
  }

  private shouldContinuePrev(
    prevTodo:
      | Pick<PetTodo, 'kind' | 'mode'>
      | { kind?: PetTodoKind; mode?: PetTodoMode }
      | null
      | undefined,
  ) {
    if (!prevTodo || prevTodo.mode !== 'ongoing') {
      return false;
    }
    if (prevTodo.kind === 'sleep' && !this.canSleepNow()) {
      return false;
    }
    return Math.random() < 0.9;
  }

  private async pickBySourceWithContinuation(
    petId: string,
    pickedBy: Extract<AutoPickSource, 'energy' | 'happiness' | 'work'>,
    fallbackPicker: () => WeightedPickResult | Promise<WeightedPickResult>,
    currentTodo?: Pick<PetTodo, 'kind' | 'mode' | 'pickedBy' | 'source'> | null,
  ): Promise<WeightedPickResult> {
    const currentPickedBy = (currentTodo?.pickedBy || null) as AutoPickSource | null;
    const useCurrent =
      !!currentTodo && currentTodo.source === 'auto' && currentPickedBy === pickedBy;

    let prevTodo:
      | Pick<PetTodo, 'kind' | 'mode'>
      | { kind?: PetTodoKind; mode?: PetTodoMode }
      | null = null;

    if (useCurrent) {
      prevTodo = currentTodo as Pick<PetTodo, 'kind' | 'mode'>;
    } else {
      prevTodo = (await this.petTodoModel
        .findOne({ petId, status: { $in: ['done', 'cancelled'] } })
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as { kind?: PetTodoKind; mode?: PetTodoMode } | null;
    }

    if (this.shouldContinuePrev(prevTodo)) {
      return {
        kind: prevTodo!.kind as PetTodoKind,
        weight: 0,
        rankedWeights: [],
        continued: true,
      };
    }

    return await fallbackPicker();
  }

  /**
   * 选择食物的加权算法
   *
   * 核心逻辑（与饮品逻辑保持一致，并加入食物特有规则）：
   * 1. 筛选：去掉买不起的食物
   * 2. 基础权重：根据价格用函数 y = 1 + e^(-0.01204*x) 计算
   * 3. 属性调整：根据精力/冷暖/快乐修正权重
   * 4. 饱度目标调整：优先把饱度推到更合适区间的食物
   * 5. 体重热量调整：按卡路里密度与体重偏离程度修正
   * 6. 厌倦修正：根据最近5次食物记录应用厌倦系数
   * 7. 选择：从所有正权重食物中随机选择
   */
  private async pickFoodTodoKind(petId: string = DEFAULT_PET_ID): Promise<WeightedPickResult> {
    // ===== 阶段1: 获取食物模板和宠物状态 =====
    const foodTemplates = Object.entries(TODO_TEMPLATES)
      .filter(([, template]) => template.hungerDelta > 0)
      .map(([kind, template]) => ({ kind: kind as PetTodoKind, ...template }));

    if (!foodTemplates.length) {
      return { kind: 'eat-luosifen', weight: 0, rankedWeights: [] };
    }

    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats) {
      return { kind: 'eat-luosifen', weight: 0, rankedWeights: [] };
    }

    const money = Number(stats.money || 0);
    const hunger = Number(stats.hunger || 0);
    const hungerMax = Number(stats.hungerMax || 100);
    const thirst = Number(stats.thirst || 0);
    const energy = Number(stats.energy || 0);
    const warmth = Number(stats.warmth || 0);
    const happiness = Number(stats.happiness || 0);
    const weight = Number(stats.weightKg || 0);

    // ===== 阶段2: 筛选能买得起的食物 =====
    const affordableFoods = foodTemplates.filter((template) => {
      const cost = Math.abs(template.moneyDelta);
      return money >= cost && this.isTodoAvailableAt(template.kind);
    });

    if (!affordableFoods.length) {
      return { kind: 'eat-luosifen', weight: 0, rankedWeights: [] };
    }

    // ===== 阶段3: 计算基础权重（基于价格） =====
    // 函数: y = 1 + e^(-0.01204 * x)
    // x = 0 (免费): y = 2
    // x 增大时: y 逐步趋近 1
    const priceWeights = new Map<PetTodoKind, number>();
    for (const food of affordableFoods) {
      const price = Math.abs(food.moneyDelta);
      const baseWeight = 1 + Math.exp(-0.01204 * price);
      priceWeights.set(food.kind, baseWeight);
    }

    // ===== 阶段4: 根据宠物属性调整权重 =====
    const attributeWeights = new Map<PetTodoKind, number>(priceWeights);

    for (const food of affordableFoods) {
      let weightScore = priceWeights.get(food.kind) || 0;

      // 精力低于50时：每低1的精力，加精力食物权重+0.02
      if (energy < 50 && food.energyDelta > 0) {
        const energyDeficit = 50 - energy;
        weightScore += energyDeficit * 0.02;
      }

      const warmthDelta = this.getWarmthWeightDelta(warmth, food.warmthDelta);
      if (warmthDelta) {
        weightScore += warmthDelta;
        if (weightScore <= 0) {
          attributeWeights.set(food.kind, 0);
          continue;
        }
      }

      const caloricDelta = this.getCaloricWeightDelta(weight, food.caloriesDelta, food.hungerDelta);
      if (caloricDelta) {
        weightScore += caloricDelta;
        if (weightScore <= 0) {
          attributeWeights.set(food.kind, 0);
          continue;
        }
      }

      const hungerMultiplier = this.getHungerWeightMultiplier(hunger, food.hungerDelta);
      weightScore *= hungerMultiplier;
      if (weightScore <= 0) {
        attributeWeights.set(food.kind, 0);
        continue;
      }

      // 快乐低于50时：每低1的快乐，加快乐食物权重+0.02
      if (happiness < 50 && food.happinessDelta > 0) {
        const happinessDeficit = 50 - happiness;
        weightScore += happinessDeficit * 0.02;
      }

      attributeWeights.set(food.kind, Math.max(0, weightScore));
    }

    // ===== 阶段5: 获取最近5次吃过的食物 =====
    const recentFoods = await this.petTodoModel
      .find({
        petId,
        status: 'done',
        hungerDelta: { $gt: 0 },
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    const foodFrequency = new Map<PetTodoKind, number>();
    for (const todo of recentFoods) {
      const kind = (todo as any).kind as PetTodoKind;
      foodFrequency.set(kind, (foodFrequency.get(kind) || 0) + 1);
    }

    // ===== 阶段6: 应用厌倦系数 =====
    // 函数: y = 1 / (1 + e^(1.68(x - 2.17)))
    const finalWeights = new Map<PetTodoKind, number>();
    for (const food of affordableFoods) {
      const attributeWeight = attributeWeights.get(food.kind) || 0;
      const appearCount = foodFrequency.get(food.kind) || 0;

      const tediumCoefficient = 1 / (1 + Math.exp(1.68 * (appearCount - 2.17)));
      const clampedCoefficient = Math.max(0, Math.min(1, tediumCoefficient));

      let finalWeight = attributeWeight * clampedCoefficient;
      const projectedThirst = thirst + Number(food.thirstDelta || 0);
      if (projectedThirst > 100) {
        finalWeight *= 0.9;
      }

      finalWeights.set(food.kind, finalWeight);
    }

    // ===== 阶段7: 随机选择 =====
    const validWeights = Array.from(finalWeights.entries())
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1]);

    if (!validWeights.length) {
      return { kind: 'eat-luosifen', weight: 0, rankedWeights: [] };
    }

    const selected = this.selectWeightedPick(new Map(validWeights));
    return selected;
  }

  /**
   * 选择饮料的加权算法
   * 
   * 核心逻辑：
   * 1. 筛选：去掉买不起的饮料
   * 2. 基础权重：根据价格用函数 y = 1 + e^(-0.1204*x) 计算，x为价格绝对值
   * 3. 属性调整：根据宠物当前属性修正权重
   * 4. 厌倦修正：根据最近5次饮料记录应用厌倦系数
   * 5. 选择：从所有正权重的饮料中随机选择
   */
  private async pickDrinkTodoKind(petId: string = DEFAULT_PET_ID): Promise<WeightedPickResult> {
    // ===== 阶段1: 获取饮料模板和宠物状态 =====
    const drinkTemplates = Object.entries(TODO_TEMPLATES)
      .filter(([, template]) => template.thirstDelta > 0)
      .map(([kind, template]) => ({ kind: kind as PetTodoKind, ...template }));

    if (!drinkTemplates.length) {
      return { kind: 'drink-water', weight: 0, rankedWeights: [] };
    }

    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats) {
      return { kind: 'drink-water', weight: 0, rankedWeights: [] };
    }

    const money = Number(stats.money || 0);
    const hunger = Number(stats.hunger || 0);
    const energy = Number(stats.energy || 0);
    const warmth = Number(stats.warmth || 0);
    const happiness = Number(stats.happiness || 0);
    const weight = Number(stats.weightKg || 0);

    // ===== 阶段2: 筛选能买得起的饮料 =====
    const affordableDrinks = drinkTemplates.filter((template) => {
      const cost = Math.abs(template.moneyDelta);
      return money >= cost && this.isTodoAvailableAt(template.kind);
    });

    if (!affordableDrinks.length) {
      // 都买不起时，返回最便宜的免费饮料
      return { kind: 'drink-water', weight: 0, rankedWeights: [] };
    }

    // ===== 阶段3: 计算基础权重（基于价格） =====
    // 函数: y = 1 + e^(-0.1204 * x)
    // x = 0 (免费): y ≈ 2
    // x = 50: y ≈ 1.06
    // x → ∞: y → 1
    // 解释: 便宜的饮料权重高，贵的饮料权重低
    const priceWeights = new Map<PetTodoKind, number>();
    for (const drink of affordableDrinks) {
      const price = Math.abs(drink.moneyDelta);
      // 使用指数函数计算权重
      const baseWeight = 1 + Math.exp(-0.1204 * price);
      priceWeights.set(drink.kind, baseWeight);
    }

    // ===== 阶段4: 根据宠物属性调整权重 =====
    const attributeWeights = new Map<PetTodoKind, number>(priceWeights);

    for (const drink of affordableDrinks) {
      let weight = priceWeights.get(drink.kind) || 0;

      // 精力低于50时：每低1的精力，加精力饮品权重+0.02
      if (energy < 50 && drink.energyDelta > 0) {
        const energyDeficit = 50 - energy;
        weight += energyDeficit * 0.02;
      }

      const warmthDelta = this.getWarmthWeightDelta(warmth, drink.warmthDelta);
      if (warmthDelta) {
        weight += warmthDelta;
        if (weight <= 0) {
          attributeWeights.set(drink.kind, 0);
          continue;
        }
      }

      const caloricDelta = this.getCaloricWeightDelta(weight, drink.caloriesDelta, drink.hungerDelta);
      if (caloricDelta) {
        weight += caloricDelta;
        if (weight <= 0) {
          attributeWeights.set(drink.kind, 0);
          continue;
        }
      }

      const hungerMultiplier = this.getHungerWeightMultiplier(hunger, drink.hungerDelta);
      weight *= hungerMultiplier;
      if (weight <= 0) {
        attributeWeights.set(drink.kind, 0);
        continue;
      }

      // 快乐低于50时：每低1的快乐，加快乐饮品权重+0.02
      if (happiness < 50 && drink.happinessDelta > 0) {
        const happinessDeficit = 50 - happiness;
        weight += happinessDeficit * 0.02;
      }

      attributeWeights.set(drink.kind, Math.max(0, weight));
    }

    // ===== 阶段5: 获取最近5次喝过的饮料 =====
    const recentDrinks = await this.petTodoModel
      .find({
        petId,
        status: 'done',
        thirstDelta: { $gt: 0 }, // 只查找饮品任务
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    // 统计每个饮料出现的次数
    const drinkFrequency = new Map<PetTodoKind, number>();
    for (const todo of recentDrinks) {
      const kind = (todo as any).kind as PetTodoKind;
      drinkFrequency.set(kind, (drinkFrequency.get(kind) || 0) + 1);
    }

    // ===== 阶段6: 应用厌倦系数 =====
    // 函数: y = 1 / (1 + e^(1.68(x - 2.17)))
    // x = 0: y ≈ 0.974 (接近1，很少被厌倦)
    // x = 1: y ≈ 0.646 (中等厌倦)
    // x = 2: y ≈ 0.253 (较高厌倦)
    // x = 5: y ≈ 0.0086 (几乎完全厌倦)
    // 解释: x是饮料在近5次中出现的次数，出现越多越容易被厌倦
    const finalWeights = new Map<PetTodoKind, number>();

    for (const drink of affordableDrinks) {
      const attributeWeight = attributeWeights.get(drink.kind) || 0;
      const appearCount = drinkFrequency.get(drink.kind) || 0;

      // 计算厌倦系数: y = 1 / (1 + e^(1.68(x - 2.17)))
      const tediumCoefficient = 1 / (1 + Math.exp(1.68 * (appearCount - 2.17)));
      // 确保系数在 [0, 1] 范围内
      const clampedCoefficient = Math.max(0, Math.min(1, tediumCoefficient));

      // 最终权重 = 属性权重 * 厌倦系数
      let finalWeight = attributeWeight * clampedCoefficient;
      const projectedHunger = hunger + Number(drink.hungerDelta || 0);
      if (projectedHunger > 100) {
        finalWeight *= 0.9;
      }
      finalWeights.set(drink.kind, finalWeight);
    }

    // ===== 阶段7: 随机选择 =====
    // 只考虑权重为正的饮料
    const validWeights = Array.from(finalWeights.entries())
      .filter(([, weight]) => weight > 0)
      .sort((a, b) => b[1] - a[1]); // 按权重降序排列（便于调试）

    if (!validWeights.length) {
      // 如果没有正权重的饮料，降级到免费饮料或随机选择
      return { kind: 'drink-water', weight: 0, rankedWeights: [] };
    }

    return this.selectWeightedPick(new Map(validWeights));
  }

  private pickEnergyTodoKind(): WeightedPickResult {
    const candidates = Object.values(TODO_TEMPLATES)
      .filter((template) => template.energyDelta > 0)
      .filter((template) => this.isTodoAvailableAt(template.kind))
      .map((template) => template.kind);
    if (!candidates.length) {
      const kind = this.canSleepNow() ? 'sleep' : 'drink-coffee';
      return { kind, weight: 1, rankedWeights: [{ kind, title: TODO_TEMPLATES[kind].title, weight: 1 }] };
    }
    const weights = new Map<PetTodoKind, number>();
    for (const kind of candidates) {
      weights.set(kind, 1);
    }
    return this.selectWeightedPick(weights);
  }

  private async pickHappinessTodoKind(): Promise<WeightedPickResult> {
    const candidates = Object.values(TODO_TEMPLATES)
      .filter((template) =>
        ['sleep', 'watch-short-video', 'play-genshin', 'slow-jog'].includes(template.kind),
      )
      .filter((template) => this.isTodoAvailableAt(template.kind))
      .map((template) => template.kind);
    if (!candidates.length) {
      const kind = 'play-genshin' as PetTodoKind;
      return { kind, weight: 1, rankedWeights: [{ kind, title: TODO_TEMPLATES[kind].title, weight: 1 }] };
    }
    const stats = await this.petStatsModel.findOne({ petId: DEFAULT_PET_ID }).lean().exec();
    const weights = new Map<PetTodoKind, number>();
    const weightKg = Number(stats?.weightKg || 0);
    for (const kind of candidates) {
      const template = TODO_TEMPLATES[kind];
      let weight = 1;
      const caloricDelta = this.getCaloricWeightDelta(
        weightKg,
        template.caloriesDelta || 0,
        template.hungerDelta || 0,
      );
      if (caloricDelta) {
        weight += caloricDelta;
      }
      if (weight > 0) {
        weights.set(kind, weight);
      }
    }
    return this.selectWeightedPick(weights);
  }

  /**
   * 选择休闲事项的加权算法
   *
   * 规则：
   * 1. 每个休闲事项基础权重为 1
   * 2. 饱度偏高时，能消耗饱度的事项获得额外加权
   * 3. 体重偏高时，能消耗卡路里的事项获得额外加权
   * 4. 最近 5 个休闲事项应用厌倦系数
   */
  private async pickLeisureTodoKind(
    petId: string = DEFAULT_PET_ID,
    statsInput?: Pick<PetStats, 'hunger' | 'weightKg'> | null,
  ): Promise<WeightedPickResult> {
    const candidates = Object.values(TODO_TEMPLATES)
      .filter((template) =>
        ['sleep', 'watch-short-video', 'play-genshin', 'slow-jog'].includes(template.kind),
      )
      .filter((template) => this.isTodoAvailableAt(template.kind))
      .map((template) => template.kind);

    if (!candidates.length) {
      const kind = this.canSleepNow() ? 'sleep' : 'watch-short-video';
      return { kind, weight: 0, rankedWeights: [] };
    }

    const stats = statsInput || (await this.petStatsModel.findOne({ petId }).lean().exec());
    if (!stats) {
      const kind = this.canSleepNow() ? 'sleep' : 'watch-short-video';
      return { kind, weight: 0, rankedWeights: [] };
    }

    const hunger = Number(stats.hunger || 0);
    const weightKg = Number(stats.weightKg || 0);
    const isLateNight = this.getTimePeriodByBeijing() === 'late-night';

    const recentLeisureTodos = await this.petTodoModel
      .find({ petId, kind: { $in: candidates } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    const leisureFrequency = new Map<PetTodoKind, number>();
    for (const todo of recentLeisureTodos) {
      const kind = todo.kind as PetTodoKind;
      leisureFrequency.set(kind, (leisureFrequency.get(kind) || 0) + 1);
    }

    const finalWeights = new Map<PetTodoKind, number>();

    for (const kind of candidates) {
      const template = TODO_TEMPLATES[kind];
      let weight = 1;

      if (template.hungerDelta < 0) {
        if (hunger > 110) {
          weight += 1;
        } else if (hunger > 100) {
          weight += 0.6;
        } else if (hunger > 90) {
          weight += 0.2;
        }
      }

      if (weightKg > 55 && (template.caloriesDelta || 0) < 0) {
        weight += (weightKg - 55) * 0.1;
      }

      if (kind === 'sleep' && isLateNight) {
        weight += 10;
      }

      const appearCount = leisureFrequency.get(kind) || 0;
      const tediumCoefficient = 1 / (1 + Math.exp(1.68 * (appearCount - 2.17)));
      const clampedCoefficient = Math.max(0, Math.min(1, tediumCoefficient));
      finalWeights.set(kind, Math.max(0, weight * clampedCoefficient));
    }

    const validWeights = Array.from(finalWeights.entries()).filter(([, weight]) => weight > 0);
    if (!validWeights.length) {
      const kind = this.canSleepNow() ? 'sleep' : 'watch-short-video';
      return { kind, weight: 0, rankedWeights: [] };
    }

    return this.selectWeightedPick(new Map(validWeights));
  }

  /**
   * 选择工作的加权算法
   *
   * 规则：
   * 1. 每个工作基础权重为 1
   * 2. 按熟练度等级加权：0/+0.2/+0.4/+0.8
   * 3. 对最近进行的 5 个工作应用厌倦系数
   */
  private async pickWorkTodoKind(petId: string = DEFAULT_PET_ID): Promise<WeightedPickResult> {
    const candidates: PetTodoKind[] = ['work-code', 'work-live'];

    // 读取每个工作的最新技能经验，用于计算熟练度等级
    const latestSkillTodos = await this.petTodoModel
      .find({ petId, kind: { $in: candidates }, hasSkill: true })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const skillExpByKind = new Map<PetTodoKind, number>();
    for (const todo of latestSkillTodos) {
      const kind = todo.kind as PetTodoKind;
      if (!skillExpByKind.has(kind)) {
        skillExpByKind.set(kind, Number(todo.skillExp || 0));
      }
    }

    // 最近进行的 5 个工作（用于厌倦）
    const recentWorks = await this.petTodoModel
      .find({ petId, kind: { $in: candidates } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    const workFrequency = new Map<PetTodoKind, number>();
    for (const todo of recentWorks) {
      const kind = todo.kind as PetTodoKind;
      workFrequency.set(kind, (workFrequency.get(kind) || 0) + 1);
    }

    const finalWeights = new Map<PetTodoKind, number>();

    for (const kind of candidates) {
      const exp = Number(skillExpByKind.get(kind) || 0);
      const level = this.getLevelByExp(exp);

      // 等级加权：0/+0.2/+0.4/+0.8（当前系统等级为 1~3）
      const skillBonus = level >= 3 ? 0.8 : level === 2 ? 0.4 : level === 1 ? 0.2 : 0;
      const baseWeight = 1 + skillBonus;

      // 厌倦系数: y = 1 / (1 + e^(1.68(x - 2.17)))
      const appearCount = workFrequency.get(kind) || 0;
      const tediumCoefficient = 1 / (1 + Math.exp(1.68 * (appearCount - 2.17)));
      const clampedCoefficient = Math.max(0, Math.min(1, tediumCoefficient));

      finalWeights.set(kind, Math.max(0, baseWeight * clampedCoefficient));
    }

    const validWeights = Array.from(finalWeights.entries()).filter(([, w]) => w > 0);
    if (!validWeights.length) {
      const kind = candidates[Math.floor(Math.random() * candidates.length)];
      return { kind, weight: 0, rankedWeights: [] };
    }

    return this.selectWeightedPick(new Map(validWeights));
  }

  async triggerTodo(
    kind: PetTodoKind,
    source: 'auto' | 'manual',
    petId = DEFAULT_PET_ID,
    startReason?: string,
    pickedBy?: AutoPickSource,
  ) {
    const template = TODO_TEMPLATES[kind];
    if (!template) {
      return this.getSnapshot(petId);
    }

    if (!this.isTodoAvailableAt(kind)) {
      if (source === 'manual') {
        await this.petRecordModel.create({
          petId,
          type: 'system',
          message: `${template.title} 当前时段不可用`,
          happenedAt: new Date(),
        });
      }
      return this.getSnapshot(petId);
    }

    await this.ensurePet(petId);
    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats) {
      return this.getSnapshot(petId);
    }

    if (kind === 'sleep' && !this.canSleepNow()) {
      if (source === 'manual') {
        await this.petRecordModel.create({
          petId,
          type: 'interrupt',
          message: '当前时段无法睡觉（仅中午或深夜可睡）',
          happenedAt: new Date(),
        });
      }
      return this.getSnapshot(petId);
    }

    const runningTodo = await this.petTodoModel
      .findOne({ petId, status: 'running' })
      .sort({ createdAt: -1 })
      .exec();
    if (runningTodo) {
      this.normalizeTodoFields(runningTodo);
    }

    if (runningTodo) {
      await this.interruptTodoWithProgress(runningTodo, stats);
    }

    let skillExp = 0;
    let skillLevel = 1;
    if (template.hasSkill) {
      const latestSameKindTodo = await this.petTodoModel
        .findOne({ petId, kind, hasSkill: true })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      skillExp = latestSameKindTodo?.skillExp || 0;
      skillLevel = this.getLevelByExp(skillExp);
    }

    const now = new Date();
    const todo = await this.petTodoModel.create({
      petId,
      kind: template.kind,
      title: template.title,
      mode: template.mode,
      source,
      status: 'running',
      elapsedMinutes: 0,
      totalMinutes: template.totalMinutes,
      settleEveryMinutes: template.settleEveryMinutes || 1,
      minDurationMinutes:
        template.kind === 'sleep' && this.getTimePeriodByBeijing() === 'late-night'
          ? 120
          : template.minDurationMinutes || 0,
      hungerDelta: template.hungerDelta,
      thirstDelta: template.thirstDelta,
      happinessDelta: template.happinessDelta,
      energyDelta: template.energyDelta,
      healthDelta: template.healthDelta,
      warmthDelta: template.warmthDelta,
      moneyDelta: template.moneyDelta,
      hasSkill: !!template.hasSkill,
      skillExp,
      skillLevel,
      caloriesDelta: template.caloriesDelta || 0,
      teaEnergyBuffMinutes: template.teaEnergyBuffMinutes || 0,
      gojiHealthBuffMinutes: template.gojiHealthBuffMinutes || 0,
      gojiEnergyBuffMinutes: template.gojiEnergyBuffMinutes || 0,
      pickedBy: source === 'auto' ? pickedBy || null : null,
      startedAt: now,
    });

    await this.petRecordModel.create({
      petId,
      type: 'start',
      todoId: todo._id.toString(),
      message: todo.title,
      reason: source === 'auto' ? `${startReason || ''}` : '',
      happenedAt: now,
    });

    return this.getSnapshot(petId);
  }

  async restartPet(petId = DEFAULT_PET_ID) {
    await this.ensurePet(petId);

    await this.petTodoModel.deleteMany({ petId }).exec();
    await this.petThingModel.deleteMany({ petId }).exec();
    await this.petRecordModel.deleteMany({ petId }).exec();

    await this.petStatsModel
      .updateOne(
        { petId },
        {
          $set: {
            ...DEFAULT_STATS,
          },
        },
      )
      .exec();

    await this.ensureRunningTodo(petId);
    return this.getSnapshot(petId);
  }

  async updatePetName(name: string, petId = DEFAULT_PET_ID) {
    const nextName = `${name || ''}`.trim().slice(0, 20);
    if (!nextName) {
      return this.getSnapshot(petId);
    }

    await this.ensurePet(petId);
    await this.petStatsModel.updateOne({ petId }, { $set: { name: nextName } }).exec();
    return this.getSnapshot(petId);
  }

  async updatePetLocation(lat: number, lng: number, petId = DEFAULT_PET_ID) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return this.getSnapshot(petId);
    }
    await this.ensurePet(petId);
    await this.petStatsModel
      .updateOne({ petId }, { $set: { currentLat: lat, currentLng: lng } })
      .exec();
    await this.upsertMergedLocation(petId, lat, lng, 'track');
    return this.getSnapshot(petId);
  }

  async setPetHome(lat: number, lng: number, petId = DEFAULT_PET_ID) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return this.getSnapshot(petId);
    }
    await this.ensurePet(petId);
    await this.petStatsModel
      .updateOne(
        { petId },
        { $set: { homeLat: lat, homeLng: lng, currentLat: lat, currentLng: lng } },
      )
      .exec();
    await this.upsertMergedLocation(petId, lat, lng, 'home');
    return this.getSnapshot(petId);
  }

  async purchaseThing(itemId: string, petId = DEFAULT_PET_ID) {
    const item = SHOP_CATALOG.find((entry) => entry.itemId === itemId);
    if (!item) {
      return this.getSnapshot(petId);
    }

    await this.ensurePet(petId);
    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats || stats.money < item.price) {
      return this.getSnapshot(petId);
    }

    stats.money = Math.max(0, round2(stats.money - item.price));

    await stats.save();

    const existing = await this.petThingModel.findOne({ petId, itemId }).exec();
    if (existing && item.equippable) {
      existing.name = item.name;
      existing.description = item.description;
      existing.price = item.price;
      existing.equippable = item.equippable;
      existing.sellRate = item.sellRate;
      existing.durabilityDailyDecay = item.durabilityDailyDecay;
      existing.durability = Math.max(existing.durability || 0, item.initialDurability || 0);
      await existing.save();

      await this.petRecordModel.create({
        petId,
        type: 'interrupt',
        message: `${item.name} 为可装备道具，无法重复购买`,
        happenedAt: new Date(),
      });
      return this.getSnapshot(petId);
    }

    if (existing) {
      existing.count = Math.max(1, (existing.count || 0) + 1);
      existing.name = item.name;
      existing.description = item.description;
      existing.price = item.price;
      existing.equippable = item.equippable;
      existing.sellRate = item.sellRate;
      existing.durability = Math.max(existing.durability || 0, item.initialDurability || 0);
      existing.durabilityDailyDecay = item.durabilityDailyDecay || 0;
      await existing.save();
    } else {
      await this.petThingModel.create({
        petId,
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        price: item.price,
        equippable: item.equippable,
        sellRate: item.sellRate,
        equipped: false,
        durability: item.initialDurability,
        durabilityDailyDecay: item.durabilityDailyDecay,
        count: 1,
      });
    }

    await this.petRecordModel.create({
      petId,
      type: 'progress',
      message: `购买 ${item.name} -${round2(item.price)}元`,
      happenedAt: new Date(),
    });

    return this.getSnapshot(petId);
  }

  async useThing(itemId: string, petId = DEFAULT_PET_ID) {
    await this.ensurePet(petId);
    const thing = await this.petThingModel.findOne({ petId, itemId }).exec();
    if (!thing || (thing.count || 0) <= 0) {
      return this.getSnapshot(petId);
    }

    if (itemId !== 'revive-potion') {
      await this.petRecordModel.create({
        petId,
        type: 'interrupt',
        message: `${thing.name} 无法直接使用`,
        happenedAt: new Date(),
      });
      return this.getSnapshot(petId);
    }

    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats) {
      return this.getSnapshot(petId);
    }

    stats.health = round2(clamp(stats.health + 100, 0, 100));
    (stats as any).reviveHealthBuffMinutes = Math.max(
      Number((stats as any).reviveHealthBuffMinutes || 0),
      120,
    );
    await stats.save();

    thing.count = Math.max(0, (thing.count || 0) - 1);
    if (thing.count <= 0) {
      await thing.deleteOne();
    } else {
      await thing.save();
    }

    await this.petRecordModel.create({
      petId,
      type: 'progress',
      message: `使用 ${thing.name} +100健康 +1健康/分钟(120分钟)`,
      happenedAt: new Date(),
    });

    return this.getSnapshot(petId);
  }

  async equipThing(itemId: string, petId = DEFAULT_PET_ID) {
    await this.ensurePet(petId);
    const thing = await this.petThingModel.findOne({ petId, itemId }).exec();
    if (!thing || !thing.equippable) {
      return this.getSnapshot(petId);
    }

    if (!thing.equipped) {
      thing.equipped = true;
      await thing.save();

      await this.petRecordModel.create({
        petId,
        type: 'progress',
        message: `装备 ${thing.name}`,
        happenedAt: new Date(),
      });
    }

    return this.getSnapshot(petId);
  }

  async unequipThing(itemId: string, petId = DEFAULT_PET_ID) {
    await this.ensurePet(petId);
    const thing = await this.petThingModel.findOne({ petId, itemId }).exec();
    if (!thing || !thing.equippable) {
      return this.getSnapshot(petId);
    }

    if (thing.equipped) {
      thing.equipped = false;
      await thing.save();

      await this.petRecordModel.create({
        petId,
        type: 'progress',
        message: `卸下 ${thing.name}`,
        happenedAt: new Date(),
      });
    }

    return this.getSnapshot(petId);
  }

  private getSellPrice(thing: Pick<PetThing, 'price' | 'sellRate'>) {
    return Math.max(0, round2((thing.price || 0) * Math.max(0, thing.sellRate || 0)));
  }

  async sellThing(itemId: string, petId = DEFAULT_PET_ID) {
    await this.ensurePet(petId);
    const thing = await this.petThingModel.findOne({ petId, itemId }).exec();
    if (!thing || (thing.count || 0) <= 0) {
      return this.getSnapshot(petId);
    }

    const stats = await this.petStatsModel.findOne({ petId }).exec();
    if (!stats) {
      return this.getSnapshot(petId);
    }

    const refund = this.getSellPrice(thing);
    stats.money = Math.max(0, round2(stats.money + refund));
    await stats.save();

    thing.count = Math.max(0, (thing.count || 0) - 1);
    if (thing.count <= 0) {
      await thing.deleteOne();
    } else {
      await thing.save();
    }

    await this.petRecordModel.create({
      petId,
      type: 'progress',
      message: `出售 ${thing.name} +${round2(refund)}元`,
      happenedAt: new Date(),
    });

    return this.getSnapshot(petId);
  }

  private async upsertMergedLocation(
    petId: string,
    lat: number,
    lng: number,
    source: 'track' | 'home',
  ) {
    const candidates = await this.petLocationModel
      .find({ petId, source })
      .sort({ happenedAt: -1 })
      .limit(2000)
      .exec();

    let nearest: PetLocation | null = null;
    let nearestDistance = Infinity;
    for (const point of candidates) {
      const distance = this.calcDistanceKm(lat, lng, point.lat, point.lng);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = point;
      }
    }

    if (nearest && nearestDistance < 1) {
      const prevCount = Math.max(1, nearest.count || 1);
      const nextCount = prevCount + 1;
      nearest.lat = round2((nearest.lat * prevCount + lat) / nextCount);
      nearest.lng = round2((nearest.lng * prevCount + lng) / nextCount);
      nearest.count = nextCount;
      nearest.happenedAt = new Date();
      await nearest.save();
      return;
    }

    await this.petLocationModel.create({
      petId,
      lat,
      lng,
      count: 1,
      source,
      happenedAt: new Date(),
    });
  }

  private getTravelInfo(
    stats:
      | Pick<PetStats, 'homeLat' | 'homeLng' | 'currentLat' | 'currentLng'>
      | null
      | undefined,
  ): TravelInfo {
    if (!stats) {
      return {
        type: 'none',
        distanceKm: 0,
        effects: { hungerDelta: 0, thirstDelta: 0, energyDelta: 0, happinessDelta: 0 },
      };
    }
    const { homeLat, homeLng, currentLat, currentLng } = stats;
    if (
      !Number.isFinite(homeLat) ||
      !Number.isFinite(homeLng) ||
      !Number.isFinite(currentLat) ||
      !Number.isFinite(currentLng)
    ) {
      return {
        type: 'none',
        distanceKm: 0,
        effects: { hungerDelta: 0, thirstDelta: 0, energyDelta: 0, happinessDelta: 0 },
      };
    }

    const distanceKm = this.calcDistanceKm(homeLat as number, homeLng as number, currentLat as number, currentLng as number);
    if (distanceKm >= 50 && distanceKm <= 200) {
      return {
        type: 'short',
        distanceKm,
        effects: { hungerDelta: -0.03, thirstDelta: -0.03, energyDelta: -0.01, happinessDelta: 0.09 },
      };
    }
    if (distanceKm > 200 && distanceKm <= 2000) {
      return {
        type: 'medium',
        distanceKm,
        effects: { hungerDelta: -0.04, thirstDelta: -0.04, energyDelta: -0.02, happinessDelta: 0.11 },
      };
    }
    if (distanceKm > 2000) {
      return {
        type: 'long',
        distanceKm,
        effects: { hungerDelta: -0.05, thirstDelta: -0.05, energyDelta: -0.04, happinessDelta: 0.14 },
      };
    }
    return {
      type: 'none',
      distanceKm,
      effects: { hungerDelta: 0, thirstDelta: 0, energyDelta: 0, happinessDelta: 0 },
    };
  }

  private calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return round2(R * c);
  }

  private async tickAllPets() {
    const statsList = await this.petStatsModel.find({}).exec();
    for (const stats of statsList) {
      await this.tickSinglePet(stats);
    }
  }

  private async tickSinglePet(stats: PetStats) {
    const petId = stats.petId;
    const now = new Date();
    const travel = this.getTravelInfo(stats);
    const weather = await this.getWeatherInfo(stats);

    stats.hunger = round2(stats.hunger + BASE_EFFECTS_PER_MINUTE.hunger);
    stats.thirst = round2(stats.thirst + BASE_EFFECTS_PER_MINUTE.thirst);
    stats.happiness = round2(
      clamp(stats.happiness + BASE_EFFECTS_PER_MINUTE.happiness, 0, stats.happinessMax),
    );
    stats.energy = round2(
      clamp(stats.energy + BASE_EFFECTS_PER_MINUTE.energy, 0, stats.energyMax),
    );
    stats.health = round2(clamp(stats.health + BASE_EFFECTS_PER_MINUTE.health, 0, stats.healthMax));

    if (travel.type !== 'none') {
      stats.hunger = round2(stats.hunger + travel.effects.hungerDelta);
      stats.thirst = round2(stats.thirst + travel.effects.thirstDelta);
      stats.energy = round2(clamp(stats.energy + travel.effects.energyDelta, 0, stats.energyMax));
      stats.happiness = round2(
        clamp(stats.happiness + travel.effects.happinessDelta, 0, stats.happinessMax),
      );
    }

    if (weather.effects.hungerDelta) {
      stats.hunger = round2(stats.hunger + weather.effects.hungerDelta);
    }
    if (weather.effects.thirstDelta) {
      stats.thirst = round2(stats.thirst + weather.effects.thirstDelta);
    }
    const sweaterEquipped = await this.petThingModel
      .findOne({ petId, itemId: 'black-sweater', equipped: true })
      .lean()
      .exec();
    const rawWeatherWarmthDelta = Number(weather.effects.warmthDelta || 0);
    const blackSweaterWarmthBonus = this.getBlackSweaterWarmthBonus(
      rawWeatherWarmthDelta,
      !!sweaterEquipped,
      weather.temperatureC,
    );
    const weatherWarmthDelta = round2(rawWeatherWarmthDelta + blackSweaterWarmthBonus);
    if (weatherWarmthDelta) {
      stats.warmth = round2(clamp(stats.warmth + weatherWarmthDelta, -100, 100));
    }

    if (Number((stats as any).teaEnergyBuffMinutes || 0) > 0) {
      (stats as any).teaEnergyBuffMinutes = Math.max(
        0,
        Number((stats as any).teaEnergyBuffMinutes || 0) - 1,
      );
      stats.energy = round2(clamp(stats.energy + 0.1, 0, stats.energyMax));
    }

    if (Number((stats as any).reviveHealthBuffMinutes || 0) > 0) {
      (stats as any).reviveHealthBuffMinutes = Math.max(
        0,
        Number((stats as any).reviveHealthBuffMinutes || 0) - 1,
      );
      stats.health = round2(clamp(stats.health + 1, 0, 100));
    }

    if (Number((stats as any).gojiHealthBuffMinutes || 0) > 0) {
      (stats as any).gojiHealthBuffMinutes = Math.max(
        0,
        Number((stats as any).gojiHealthBuffMinutes || 0) - 1,
      );
      stats.health = round2(clamp(stats.health + 0.05, 0, stats.healthMax));
    }

    if (Number((stats as any).gojiEnergyBuffMinutes || 0) > 0) {
      (stats as any).gojiEnergyBuffMinutes = Math.max(
        0,
        Number((stats as any).gojiEnergyBuffMinutes || 0) - 1,
      );
      stats.energy = round2(clamp(stats.energy + 0.02, 0, stats.energyMax));
    }

    const lowHappinessHealthDelta = this.getLowHappinessHealthDelta(Number(stats.happiness || 0));
    if (lowHappinessHealthDelta) {
      stats.health = round2(clamp(stats.health + lowHappinessHealthDelta, 0, stats.healthMax));
    }

    const injuryStatuses = this.getInjuryStatuses(stats);
    const healthPenalty = round2(
      injuryStatuses.reduce((sum, injury) => sum + injury.damagePerMinute, 0),
    );
    if (healthPenalty > 0) {
      stats.health = round2(clamp(stats.health - healthPenalty, 0, stats.healthMax));
    }

    if (stats.warmth > 0) {
      stats.warmth = round2(clamp(stats.warmth - 0.1, -100, 100));
      if (stats.warmth < 0) {
        stats.warmth = 0;
      }
    } else if (stats.warmth < 0) {
      stats.warmth = round2(clamp(stats.warmth + 0.1, -100, 100));
      if (stats.warmth > 0) {
        stats.warmth = 0;
      }
    }

    let runningTodo = await this.petTodoModel
      .findOne({ petId, status: 'running' })
      .sort({ createdAt: -1 })
      .exec();
    if (runningTodo) {
      this.normalizeTodoFields(runningTodo);
    }

    if (!runningTodo) {
      const plan = await this.pickAutoTodoPlan(stats);
      await this.triggerTodo(plan.kind, 'auto', petId, plan.reason, plan.pickedBy);
      runningTodo = await this.petTodoModel
        .findOne({ petId, status: 'running' })
        .sort({ createdAt: -1 })
        .exec();
      if (runningTodo) {
        this.normalizeTodoFields(runningTodo);
      }
    }

    if (!runningTodo) {
      await stats.save();
      return;
    }

    if (runningTodo.mode === 'ongoing') {
      const minDurationMinutes = Math.max(0, Number(runningTodo.minDurationMinutes || 0));
      if (runningTodo.elapsedMinutes < minDurationMinutes) {
        runningTodo.elapsedMinutes += 1;
        await this.applyOngoingSettlement(stats, runningTodo);
        await runningTodo.save();
        await stats.save();
        return;
      }

      let nextPlan: AutoTodoPlan | null = null;
      const hungerDecision = this.pickThisTodoKind('hunger', stats.hunger);
      if (hungerDecision.shouldPick) {
        const pick = await this.pickFoodTodoKind(stats.petId);
        nextPlan = {
          kind: pick.kind,
          reason: this.buildDetailedAutoPickReason(
            '饱度',
            stats.hunger,
            hungerDecision.probability,
            '吃',
            TODO_TEMPLATES[pick.kind].title,
            pick.weight,
            pick.rankedWeights,
          ),
          pickedBy: 'hunger',
        };
      } else {
        const thirstDecision = this.pickThisTodoKind('thirst', stats.thirst);
        if (thirstDecision.shouldPick) {
          const pick = await this.pickDrinkTodoKind(stats.petId);
          nextPlan = {
            kind: pick.kind,
            reason: this.buildDetailedAutoPickReason(
              '渴度',
              stats.thirst,
              thirstDecision.probability,
              '喝',
              TODO_TEMPLATES[pick.kind].title,
              pick.weight,
              pick.rankedWeights,
            ),
            pickedBy: 'thirst',
          };
        } else {
          const energyDecision = this.pickThisTodoKind('energy', stats.energy);
          if (energyDecision.shouldPick) {
            const pick = await this.pickBySourceWithContinuation(
              stats.petId,
              'energy',
              () => this.pickEnergyTodoKind(),
              runningTodo,
            );
            nextPlan = {
              kind: pick.kind,
              reason: this.buildDetailedAutoPickReason(
                '精力',
                stats.energy,
                energyDecision.probability,
                '休息',
                TODO_TEMPLATES[pick.kind].title,
                pick.weight,
                pick.rankedWeights,
                pick.continued,
              ),
              pickedBy: 'energy',
            };
          } else {
            const happinessDecision = this.pickThisTodoKind('happiness', stats.happiness);
            if (happinessDecision.shouldPick) {
              const pick = await this.pickBySourceWithContinuation(
                stats.petId,
                'happiness',
                () => this.pickHappinessTodoKind(),
                runningTodo,
              );
              nextPlan = {
                kind: pick.kind,
                reason: this.buildDetailedAutoPickReason(
                  '快乐',
                  stats.happiness,
                  happinessDecision.probability,
                  '休息',
                  TODO_TEMPLATES[pick.kind].title,
                  pick.weight,
                  pick.rankedWeights,
                  pick.continued,
                ),
                pickedBy: 'happiness',
              };
            } else if (runningTodo.kind !== 'work-code' && runningTodo.kind !== 'work-live') {
              const pick = await this.pickBySourceWithContinuation(
                stats.petId,
                'work',
                () => this.pickWorkTodoKind(stats.petId),
                runningTodo,
              );
              nextPlan = {
                kind: pick.kind,
                reason: this.buildDetailedAutoPickReason(
                  '工作',
                  stats.hunger,
                  1,
                  '工作',
                  TODO_TEMPLATES[pick.kind].title,
                  pick.weight,
                  pick.rankedWeights,
                  pick.continued,
                ),
                pickedBy: 'work',
              };
            }
          }
        }
      }

      if (nextPlan && nextPlan.kind !== runningTodo.kind) {
        await this.triggerTodo(nextPlan.kind, 'auto', petId, nextPlan.reason, nextPlan.pickedBy);
        await stats.save();
        return;
      }
    }

    runningTodo.elapsedMinutes += 1;

    if (runningTodo.mode === 'ongoing') {
      await this.applyOngoingSettlement(stats, runningTodo);
    }

    if (
      runningTodo.mode === 'finite' &&
      runningTodo.elapsedMinutes >= runningTodo.totalMinutes
    ) {
      await this.completeTodo(runningTodo, stats, now);
    } else {
      await runningTodo.save();
    }

    await stats.save();
  }

  private async completeTodo(todo: PetTodo, stats: PetStats, now: Date) {
    if (todo.mode === 'finite') {
      this.applyEffect(stats, todo, 1);
      if (todo.kind === 'drink-tea' && todo.teaEnergyBuffMinutes > 0) {
        (stats as any).teaEnergyBuffMinutes = Math.max(
          Number((stats as any).teaEnergyBuffMinutes || 0),
          Number(todo.teaEnergyBuffMinutes || 0),
        );
      }
      if (todo.kind === 'drink-red-date-goji-tea') {
        if (Number(todo.gojiHealthBuffMinutes || 0) > 0) {
          (stats as any).gojiHealthBuffMinutes = Math.max(
            Number((stats as any).gojiHealthBuffMinutes || 0),
            Number(todo.gojiHealthBuffMinutes || 0),
          );
        }
        if (Number(todo.gojiEnergyBuffMinutes || 0) > 0) {
          (stats as any).gojiEnergyBuffMinutes = Math.max(
            Number((stats as any).gojiEnergyBuffMinutes || 0),
            Number(todo.gojiEnergyBuffMinutes || 0),
          );
        }
      }
    }

    todo.status = 'done';
    todo.endedAt = now;
    await todo.save();

    const plan = await this.pickAutoTodoPlan(stats);
    await this.triggerTodo(plan.kind, 'auto', todo.petId, plan.reason, plan.pickedBy);
  }

  private async interruptTodoWithProgress(todo: PetTodo, stats: PetStats) {
    this.normalizeTodoFields(todo);
    if (todo.mode === 'finite' && todo.totalMinutes > 0 && todo.elapsedMinutes > 0) {
      const ratio = Math.min(1, todo.elapsedMinutes / todo.totalMinutes);
      this.applyEffect(stats, todo, ratio);
    }

    todo.status = 'cancelled';
    todo.endedAt = new Date();
    await todo.save();

    await stats.save();
  }

  private async applyOngoingSettlement(stats: PetStats, todo: PetTodo) {
    this.normalizeTodoFields(todo);
    const settleEvery = Math.max(1, todo.settleEveryMinutes || 1);
    if (todo.elapsedMinutes % settleEvery !== 0) {
      return;
    }

    if (todo.kind === 'sleep') {
      this.applyEffect(stats, todo, 1);
      return;
    }

    if (!todo.hasSkill) {
      this.applyEffect(stats, todo, 1);
      return;
    }

    let moneyGain = this.getWorkMoneyBasePerMinute(todo);
    moneyGain = round2(moneyGain * this.getWorkMoneyMultiplier(stats));

    stats.happiness = clamp(
      stats.happiness + todo.happinessDelta,
      0,
      stats.happinessMax,
    );
    stats.energy = clamp(stats.energy + todo.energyDelta, 0, stats.energyMax);
    stats.happiness = round2(stats.happiness);
    stats.energy = round2(stats.energy);
    stats.health = round2(
      clamp(stats.health + todo.healthDelta, 0, stats.healthMax),
    );
    stats.warmth = round2(clamp(stats.warmth + todo.warmthDelta, -100, 100));
    stats.money = Math.max(0, round2(stats.money + moneyGain));

    todo.skillExp = Math.min(SKILL_MAX_EXP, (todo.skillExp || 0) + 1);
    todo.skillLevel = this.getLevelByExp(todo.skillExp);
  }

  private normalizeTodoFields(todo: PetTodo) {
    if (typeof todo.energyDelta !== 'number') {
      if (todo.kind === 'sleep') {
        todo.energyDelta = 0.25;
      } else if (todo.kind === 'watch-short-video') {
        todo.energyDelta = -0.1;
      } else if (todo.kind === 'play-genshin') {
        todo.energyDelta = -0.12;
      } else if (todo.kind === 'slow-jog') {
        todo.energyDelta = 0.1;
      } else if (todo.kind === 'work-code') {
        todo.energyDelta = -0.3;
      } else if (todo.kind === 'work-live') {
        todo.energyDelta = -0.1;
      } else {
        todo.energyDelta = 0;
      }
    }
    if (typeof todo.settleEveryMinutes !== 'number') {
      todo.settleEveryMinutes = 1;
    }
    const templateMinDuration = Number(TODO_TEMPLATES[todo.kind]?.minDurationMinutes || 0);
    if (templateMinDuration > 0 && (!Number.isFinite(todo.minDurationMinutes) || Number(todo.minDurationMinutes || 0) <= 0)) {
      todo.minDurationMinutes = templateMinDuration;
    } else if (typeof todo.minDurationMinutes !== 'number') {
      todo.minDurationMinutes = templateMinDuration;
    }
    if (typeof todo.healthDelta !== 'number') {
      todo.healthDelta = todo.kind === 'slow-jog' ? 0.1 : 0;
    }
    if (typeof todo.happinessDelta !== 'number') {
      if (todo.kind === 'work-code') {
        todo.happinessDelta = -0.1;
      } else if (todo.kind === 'work-live') {
        todo.happinessDelta = -0.2;
      } else if (todo.kind === 'watch-short-video') {
        todo.happinessDelta = 0.15;
      } else if (todo.kind === 'play-genshin') {
        todo.happinessDelta = 0.2;
      } else {
        todo.happinessDelta = 0;
      }
    }
    if (typeof todo.warmthDelta !== 'number') {
      todo.warmthDelta = 0;
    }
    if (typeof todo.hasSkill !== 'boolean') {
      todo.hasSkill = todo.kind === 'work-code' || todo.kind === 'work-live';
    }
    if (typeof todo.skillExp !== 'number') {
      todo.skillExp = 0;
    }
    if (typeof todo.skillLevel !== 'number') {
      todo.skillLevel = this.getLevelByExp(todo.skillExp);
    }
    if (typeof todo.caloriesDelta !== 'number') {
      todo.caloriesDelta = 0;
    }
    if (typeof todo.teaEnergyBuffMinutes !== 'number') {
      todo.teaEnergyBuffMinutes = 0;
    }
    if (typeof todo.gojiHealthBuffMinutes !== 'number') {
      todo.gojiHealthBuffMinutes = 0;
    }
    if (typeof todo.gojiEnergyBuffMinutes !== 'number') {
      todo.gojiEnergyBuffMinutes = 0;
    }
  }

  private applyEffect(stats: PetStats, todo: PetTodo, ratio: number) {
    stats.hunger = round2(stats.hunger + todo.hungerDelta * ratio);
    stats.thirst = round2(stats.thirst + todo.thirstDelta * ratio);
    stats.happiness = round2(
      clamp(stats.happiness + todo.happinessDelta * ratio, 0, stats.happinessMax),
    );
    stats.energy = round2(
      clamp(stats.energy + todo.energyDelta * ratio, 0, stats.energyMax),
    );
    stats.health = round2(
      clamp(stats.health + todo.healthDelta * ratio, 0, stats.healthMax),
    );
    stats.warmth = round2(clamp(stats.warmth + todo.warmthDelta * ratio, -100, 100));
    stats.money = Math.max(0, round2(stats.money + todo.moneyDelta * ratio));
    if (todo.caloriesDelta) {
      stats.calories = Math.max(0, round2((stats.calories || 0) + todo.caloriesDelta * ratio));
    }
  }

  private getInjuryStatuses(
    stats: Pick<PetStats, 'hunger' | 'thirst' | 'energy' | 'warmth'> | null | undefined,
  ): InjuryStatus[] {
    if (!stats) {
      return [];
    }

    return [
      ...this.getStatusesForValue(stats.hunger, '饱度过高', '饱度过低'),
      ...this.getLowThirstStatuses(stats.thirst),
      ...this.getLowEnergyStatuses(stats.energy),
      ...this.getWarmthStatuses(stats.warmth),
    ];
  }

  private getLowThirstStatuses(value: number): InjuryStatus[] {
    if (value < 10) {
      return [this.createInjuryStatus('severe-discomfort', '严重不适', '严重缺水', 0.2)];
    }
    if (value < 20) {
      return [this.createInjuryStatus('mild-discomfort', '轻度不适', '很渴', 0.1)];
    }
    return [];
  }

  private getLowEnergyStatuses(value: number): InjuryStatus[] {
    if (value < 10) {
      return [this.createInjuryStatus('severe-discomfort', '严重不适', '非常疲惫', 0.2)];
    }
    if (value < 20) {
      return [this.createInjuryStatus('mild-discomfort', '轻度不适', '疲惫', 0.1)];
    }
    return [];
  }

  private getWarmthStatuses(value: number): InjuryStatus[] {
    if (value <= -90) {
      return [this.createInjuryStatus('heavy-injury', '重伤', '严重冻伤', 0.8)];
    }
    if (value <= -70) {
      return [this.createInjuryStatus('light-injury', '轻伤', '冻伤', 0.4)];
    }
    if (value <= -50) {
      return [this.createInjuryStatus('severe-discomfort', '严重不适', '非常冷', 0.2)];
    }
    if (value <= -30) {
      return [this.createInjuryStatus('mild-discomfort', '轻度不适', '冷', 0.1)];
    }
    if (value >= 90) {
      return [this.createInjuryStatus('heavy-injury', '重伤', '烫伤', 0.8)];
    }
    if (value >= 70) {
      return [this.createInjuryStatus('light-injury', '轻伤', '热伤', 0.4)];
    }
    if (value >= 50) {
      return [this.createInjuryStatus('severe-discomfort', '严重不适', '炎热', 0.2)];
    }
    if (value >= 30) {
      return [this.createInjuryStatus('mild-discomfort', '轻度不适', '热', 0.1)];
    }
    return [];
  }

  private getStatusesForValue(value: number, highSource: string, lowSource: string): InjuryStatus[] {
    if (value > 100 && value < 120) {
      return [this.createInjuryStatus('mild-discomfort', '轻度不适', highSource, 0.1)];
    }
    if (value >= 120 && value < 150) {
      return [this.createInjuryStatus('severe-discomfort', '严重不适', highSource, 0.2)];
    }
    if (value >= 150 && value < 200) {
      return [this.createInjuryStatus('light-injury', '轻伤', highSource, 0.4)];
    }
    if (value >= 200) {
      return [this.createInjuryStatus('heavy-injury', '重伤', highSource, 0.8)];
    }
    if (value < 0 && value > -20) {
      return [this.createInjuryStatus('mild-discomfort', '轻度不适', lowSource, 0.1)];
    }
    if (value <= -20 && value > -50) {
      return [this.createInjuryStatus('severe-discomfort', '严重不适', lowSource, 0.2)];
    }
    if (value <= -50 && value > -100) {
      return [this.createInjuryStatus('light-injury', '轻伤', lowSource, 0.4)];
    }
    if (value <= -100) {
      return [this.createInjuryStatus('heavy-injury', '重伤', lowSource, 0.8)];
    }
    return [];
  }

  private createInjuryStatus(
    key: string,
    label: InjuryStatus['label'],
    source: string,
    damagePerMinute: number,
  ): InjuryStatus {
    return {
      key: `${key}-${source}`,
      label,
      source,
      damagePerMinute,
    };
  }

  private getBlackSweaterWarmthBonus(
    rawWarmthDelta: number,
    hasEquippedBlackSweater: boolean,
    temperatureC: number | null,
  ) {
    if (!hasEquippedBlackSweater) {
      return 0;
    }

    let bonus = 0.05;
    if (temperatureC !== null && temperatureC < 10 && rawWarmthDelta < 0) {
      bonus += -rawWarmthDelta * 0.5;
    }
    return round2(bonus);
  }

  private buildStatusEffects(
    stats: Pick<PetStats, 'warmth' | 'happiness' | 'energy' | 'health'> | null | undefined,
    currentTodo: any,
    travel: TravelInfo,
    injuries: InjuryStatus[],
    weather: WeatherInfo,
    hasEquippedBlackSweater: boolean,
  ): StatusEffects {
    const effects: StatusEffects = {
      hunger: [
        { source: '默认代谢', deltaPerMinute: BASE_EFFECTS_PER_MINUTE.hunger },
      ],
      thirst: [
        { source: '默认代谢', deltaPerMinute: BASE_EFFECTS_PER_MINUTE.thirst },
      ],
      happiness: [
        { source: '默认代谢', deltaPerMinute: BASE_EFFECTS_PER_MINUTE.happiness },
      ],
      energy: [
        { source: '默认代谢', deltaPerMinute: BASE_EFFECTS_PER_MINUTE.energy },
      ],
      health: [
        { source: '默认代谢', deltaPerMinute: BASE_EFFECTS_PER_MINUTE.health },
      ],
      warmth: [],
      money: [],
    };

    const addReason = (key: keyof StatusEffects, source: string, deltaPerMinute: number) => {
      if (!deltaPerMinute) {
        return;
      }
      effects[key].push({ source, deltaPerMinute: round2(deltaPerMinute) });
    };

    if (currentTodo?.status === 'running' && currentTodo?.mode === 'ongoing') {
      const settleEvery = Math.max(1, Number(currentTodo.settleEveryMinutes || 1));
      const ratio = 1 / settleEvery;
      const source = `当前事件：${currentTodo.title || currentTodo.kind}`;
      const hungerDelta = Number(currentTodo.hungerDelta || 0) * ratio;
      const thirstDelta = Number(currentTodo.thirstDelta || 0) * ratio;
      const happinessDelta = Number(currentTodo.happinessDelta || 0) * ratio;
      const energyDelta = Number(currentTodo.energyDelta || 0) * ratio;
      const healthDelta = Number(currentTodo.healthDelta || 0) * ratio;
      const warmthDelta = Number(currentTodo.warmthDelta || 0) * ratio;
      addReason('hunger', source, hungerDelta);
      addReason('thirst', source, thirstDelta);
      addReason('happiness', source, happinessDelta);
      addReason('energy', source, energyDelta);
      addReason('health', source, healthDelta);
      addReason('warmth', source, warmthDelta);

      if (currentTodo.hasSkill && (currentTodo.kind === 'work-code' || currentTodo.kind === 'work-live')) {
        const baseMoneyPerMinute = this.getWorkMoneyBasePerMinute(currentTodo);
        const multiplier = this.getWorkMoneyMultiplier(stats as Pick<PetStats, 'energy' | 'health'>);
        addReason('money', source, baseMoneyPerMinute * multiplier * ratio);
      } else {
        addReason('money', source, Number(currentTodo.moneyDelta || 0) * ratio);
      }
    }

    if (Number((stats as any)?.teaEnergyBuffMinutes || 0) > 0) {
      addReason('energy', '喝茶余韵', 0.1);
    }

    if (Number((stats as any)?.gojiHealthBuffMinutes || 0) > 0) {
      addReason('health', '红枣枸杞茶余韵', 0.05);
    }

    if (Number((stats as any)?.gojiEnergyBuffMinutes || 0) > 0) {
      addReason('energy', '红枣枸杞茶余韵', 0.02);
    }

    if (Number((stats as any)?.reviveHealthBuffMinutes || 0) > 0) {
      addReason('health', '复活药水余效', 1);
    }

    const lowHappinessHealthDelta = this.getLowHappinessHealthDelta(Number((stats as any)?.happiness || 0));
    if (lowHappinessHealthDelta) {
      addReason('health', '快乐低于30', lowHappinessHealthDelta);
    }

    if (travel.type !== 'none') {
      const source = `旅行(${this.getTravelTypeLabel(travel.type)})`;
      addReason('hunger', source, travel.effects.hungerDelta);
      addReason('thirst', source, travel.effects.thirstDelta);
      addReason('energy', source, travel.effects.energyDelta);
      addReason('happiness', source, travel.effects.happinessDelta);
    }

    const rawWarmth = Number(weather.effects.warmthDelta || 0);
    if (weather.temperatureC !== null) {
      const source = `天气(${weather.text} ${round2(weather.temperatureC)}°C)`;
      addReason('hunger', source, weather.effects.hungerDelta);
      addReason('thirst', source, weather.effects.thirstDelta);
      addReason('warmth', source, rawWarmth);
    }
    if (hasEquippedBlackSweater) {
      addReason('warmth', '黑色毛衣', 0.05);
      if (weather.temperatureC !== null && weather.temperatureC < 10 && rawWarmth < 0) {
        addReason('warmth', '黑色毛衣(天气降温*50%)', round2(-rawWarmth * 0.5));
      }
    }

    for (const injury of injuries) {
      addReason('health', `${injury.label}(${injury.source})`, -injury.damagePerMinute);
    }

    if (Number.isFinite(stats?.warmth)) {
      if ((stats?.warmth || 0) > 0) {
        addReason('warmth', '默认回归(偏热)', -0.05);
      } else if ((stats?.warmth || 0) < 0) {
        addReason('warmth', '默认回归(偏冷)', 0.05);
      }
    }

    return effects;
  }

  private getTravelTypeLabel(type: TravelInfo['type']) {
    if (type === 'short') {
      return '短途';
    }
    if (type === 'medium') {
      return '中途';
    }
    if (type === 'long') {
      return '长途';
    }
    return '无';
  }

  private async getWeatherInfo(
    stats:
      | Pick<PetStats, 'currentLat' | 'currentLng'>
      | { currentLat?: number | null; currentLng?: number | null }
      | null
      | undefined,
  ): Promise<WeatherInfo> {
    if (MOCK_WEATHER_TEMP_C !== null) {
      const safeTemp = round2(MOCK_WEATHER_TEMP_C);
      return {
        text: '温度Mock',
        temperatureC: safeTemp,
        effects: this.getTemperatureEffectsPerMinute(safeTemp),
      };
    }

    const lat = stats?.currentLat;
    const lng = stats?.currentLng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        text: '未知',
        temperatureC: null,
        effects: { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 },
      };
    }

    const key = `${(lat as number).toFixed(2)},${(lng as number).toFixed(2)}`;
    const now = Date.now();
    const cached = this.weatherCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat as number}` +
        `&longitude=${lng as number}` +
        `&current=temperature_2m,weather_code` +
        `&timezone=auto`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`weather http ${response.status}`);
      }

      const payload = (await response.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
      };
      const temperatureC = Number(payload.current?.temperature_2m);
      const weatherCode = Number(payload.current?.weather_code);
      const safeTemp = Number.isFinite(temperatureC) ? round2(temperatureC) : null;
      const effects = this.getTemperatureEffectsPerMinute(safeTemp);
      const data: WeatherInfo = {
        text: this.getWeatherText(weatherCode),
        temperatureC: safeTemp,
        effects,
      };

      this.weatherCache.set(key, {
        data,
        expiresAt: now + 10 * 60 * 1000,
      });
      return data;
    } catch {
      if (cached) {
        return cached.data;
      }
      return {
        text: '未知',
        temperatureC: null,
        effects: { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 },
      };
    }
  }

  private getTemperatureEffectsPerMinute(temperatureC: number | null) {
    if (temperatureC === null) {
      return { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 };
    }

    if (temperatureC > 26) {
      const delta = temperatureC - 26;
      if (delta <= 0) {
        return { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 };
      }
      return {
        hungerDelta: 0,
        thirstDelta: round2(-0.01 * delta),
        warmthDelta: round2(0.01 * delta),
      };
    }

    if (temperatureC < 10) {
      const delta = 10 - temperatureC;
      if (delta <= 0) {
        return { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 };
      }
      return {
        hungerDelta: round2(-0.01 * delta),
        thirstDelta: 0,
        warmthDelta: round2(-0.01 * delta),
      };
    }

    return { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 };
  }

  private getWeatherText(code: number) {
    if (code === 0) return '晴朗';
    if (code === 1) return '晴间多云';
    if (code === 2) return '多云';
    if (code === 3) return '阴天';
    if (code === 45 || code === 48) return '雾';
    if (code === 51 || code === 53 || code === 55) return '毛毛雨';
    if (code === 56 || code === 57) return '冻毛毛雨';
    if (code === 61 || code === 63 || code === 65) return '下雨';
    if (code === 66 || code === 67) return '冻雨';
    if (code === 71 || code === 73 || code === 75) return '下雪';
    if (code === 77) return '雪粒';
    if (code === 80 || code === 81 || code === 82) return '阵雨';
    if (code === 85 || code === 86) return '阵雪';
    if (code === 95) return '雷暴';
    if (code === 96 || code === 99) return '强雷暴';
    return '未知';
  }

}

@Public()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class PetGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;

  private timer: NodeJS.Timeout | null = null;
  private connectedClientIds = new Set<string>();

  constructor(private readonly petService: PetService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.pushLatestState().catch((error) => {
        console.error('[PetGateway] pushLatestState failed:', error);
      });
    }, 5000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  handleConnection(client: Socket) {
    this.connectedClientIds.add(client.id);
  }

  handleDisconnect(client: Socket) {
    this.connectedClientIds.delete(client.id);
  }

  @SubscribeMessage('joinPet')
  async joinPet(
    @MessageBody() data: { petId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    client.join(`pet:${petId}`);
    const snapshot = await this.petService.getSnapshot(petId);
    client.emit('petState', snapshot);
  }

  @SubscribeMessage('triggerPetTodo')
  async triggerPetTodo(
    @MessageBody() data: { petId?: string; kind: PetTodoKind },
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.triggerTodo(data.kind, 'manual', petId);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
  }

  @SubscribeMessage('queryPetState')
  async queryPetState(@MessageBody() data: { petId?: string }, @ConnectedSocket() client: Socket) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.getSnapshot(petId);
    client.emit('petState', snapshot);
  }

  @SubscribeMessage('restartPet')
  async restartPet(
    @MessageBody() data: { petId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.restartPet(petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('updatePetName')
  async updatePetName(
    @MessageBody() data: { petId?: string; name: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.updatePetName(data?.name, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('updatePetLocation')
  async updatePetLocation(
    @MessageBody() data: { petId?: string; lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.updatePetLocation(data?.lat, data?.lng, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('setPetHome')
  async setPetHome(
    @MessageBody() data: { petId?: string; lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.setPetHome(data?.lat, data?.lng, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('purchasePetThing')
  async purchasePetThing(
    @MessageBody() data: { petId?: string; itemId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.purchaseThing(data?.itemId, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('equipPetThing')
  async equipPetThing(
    @MessageBody() data: { petId?: string; itemId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.equipThing(data?.itemId, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('unequipPetThing')
  async unequipPetThing(
    @MessageBody() data: { petId?: string; itemId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.unequipThing(data?.itemId, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('sellPetThing')
  async sellPetThing(
    @MessageBody() data: { petId?: string; itemId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.sellThing(data?.itemId, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  @SubscribeMessage('usePetThing')
  async usePetThing(
    @MessageBody() data: { petId?: string; itemId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const petId = data?.petId || DEFAULT_PET_ID;
    const snapshot = await this.petService.useThing(data?.itemId, petId);
    client.emit('petState', snapshot);
    this.server.to(`pet:${petId}`).emit('petState', snapshot);
    return snapshot;
  }

  private async pushLatestState() {
    if (!this.connectedClientIds.size) {
      return;
    }

    const snapshot = await this.petService.getSnapshot(DEFAULT_PET_ID);
    this.server.to(`pet:${DEFAULT_PET_ID}`).emit('petState', snapshot);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PetStats.name, schema: PetStatsSchema },
      { name: PetThing.name, schema: PetThingSchema },
      { name: PetTodo.name, schema: PetTodoSchema },
      { name: PetRecord.name, schema: PetRecordSchema },
      { name: PetLocation.name, schema: PetLocationSchema },
    ]),
  ],
  providers: [PetService, PetGateway],
})
export class PetModule {}
