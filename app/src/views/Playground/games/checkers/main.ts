import { ICheckersRoom } from 'shared/types/games/checkers.js'
import CheckersMain from './CheckersMain.vue'
import CheckersBadges from './CheckersBadges.vue'
import { GameOptions } from '../../Game.vue'

const Checkers: GameOptions = {
  main: CheckersMain,
  customBadges: CheckersBadges,
  setup: () => {},
  imActing: ({ room, userId }) => {
    return (room as ICheckersRoom).currentPlayerId === userId
  },
}

export default Checkers
