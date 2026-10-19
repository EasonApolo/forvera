import { IXiangqiRoom } from 'shared/types/games/xiangqi.js'
import XiangqiMain from './XiangqiMain.vue'
import XiangqiBadges from './XiangqiBadges.vue'
import { GameOptions } from '../../Game.vue'

const Xiangqi: GameOptions = {
  main: XiangqiMain,
  customBadges: XiangqiBadges,
  setup: () => {},
  imActing: ({ room, userId }) => {
    return (room as IXiangqiRoom).currentPlayerId === userId
  },
}

export default Xiangqi
