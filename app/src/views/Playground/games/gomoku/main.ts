import { IGomokuRoom } from 'shared/types/games/gomoku.js'
import GomokuMain from './GomokuMain.vue'
import GomokuBadges from './GomokuBadges.vue'
import { GameOptionHookParams, GameOptions } from '../../Game.vue'

const Gomoku: GameOptions = {
  main: GomokuMain,
  customBadges: GomokuBadges,
  setup: () => {},
  imActing: ({ room, userId }) => {
    return (room as IGomokuRoom).currentPlayerId === userId
  },
}

export default Gomoku
