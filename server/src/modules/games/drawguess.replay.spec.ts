import DrawGuess from './drawguess';
import { GameRoom } from '../game.module';
import { DrawGuessDurations, DrawGuessCustomMsgTypes } from 'shared/types/games/drawguess';

describe('DrawGuess round-end replay browsing', () => {
  it('serves replay data for every turn of the finished round', () => {
    jest.useFakeTimers();
    try {
      const aggregate = jest.fn().mockResolvedValue([
        { name: '猫', category: '动物', changeCount: 0 },
      ]);
      DrawGuess.registerModels(() => ({ aggregate, updateOne: jest.fn() } as any));

      const emitToUser = jest.fn();
      const room = new GameRoom({ emitToUser } as any, 'drawguess');
      // 房主 + 玩家，2 人局共 4 个 turn
      room.userConnect({ userId: 'host', clientId: 'c1' });
      room.userConnect({ userId: 'guest', clientId: 'c2' });

      room.startGame();
      expect(room.status).toBe('playing');
      expect(room.roundStatus).toBe('ing');
      expect(room.maxRounds).toBe(4);

      // 推完整个 round：before(3s) -> ing(90s) -> after(8s)，共 4 个 turn
      const fullTurn = DrawGuessDurations.TurnBeforeDuration
        + DrawGuessDurations.TurnDuration
        + DrawGuessDurations.TurnAfterDuration;
      for (let i = 0; i < 4; i += 1) {
        // before 阶段选词是异步的，先冲掉 microtask
        jest.advanceTimersByTime(0);
        room.strokes = [{ id: i, start: 0, end: 1, color: 'black', width: 1, points: [[1, 1]] } as any];
        jest.advanceTimersByTime(fullTurn);
        jest.advanceTimersByTime(0);
      }
      expect(room.roundStatus).toBe('after');
      expect(Object.keys(room.replayData).sort()).toEqual(['1', '2', '3', '4']);

      // round 结束后逐个请求回放，服务端应答对应 turn
      emitToUser.mockClear();
      for (const turn of [1, 2, 3, 4]) {
        room.game?.onMsg?.({
          type: DrawGuessCustomMsgTypes.SyncReplayData,
          room,
          user: room.users['host'],
          data: { turn },
        });
        const call = emitToUser.mock.calls.find(
          ([arg]: any[]) => arg.event === DrawGuessCustomMsgTypes.SyncReplayData,
        );
        expect(call).toBeTruthy();
        const packet = call![0].payload;
        expect(packet.data.turn).toBe(turn);
        expect(packet.data.strokes.length).toBeGreaterThan(0);
        emitToUser.mockClear();
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
