import { IHoldemRoom } from 'shared/types/games/holdem.js'
import HoldemMain from './HoldemMain.vue'
import HoldemBadges from './HoldemBadges.vue'
import HoldemGameInfo from './HoldemGameInfo.vue'
import HoldemPlayerBody from './HoldemPlayerBody.vue'
import { GameOptions } from '../../Game.vue'

const Holdem: GameOptions = {
  main: HoldemMain,
  gameinfo: HoldemGameInfo,
  customBadges: HoldemBadges,
  playerBody: HoldemPlayerBody,
  setup: () => {},
  imActing: ({ room, userId }) => {
    return (room as IHoldemRoom).currentPlayerId === userId
  },
}

export default Holdem
