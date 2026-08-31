import { IDrawGuessRoom } from 'shared/types/games/drawguess.js'
import DrawGuessMain from './DrawguessMain.vue'
import DrawGuessBadges from './DrawguessBadges.vue'
import DrawGuessChatMsg from './DrawguessChatMsg.vue'
import { GameOptionHookParams, GameOptions } from '../../Game.vue'
import DrawguessGameInfo from './DrawguessGameInfo.vue'

const DrawGuess: GameOptions = {
  gameinfo: DrawguessGameInfo,
  main: DrawGuessMain,
  customBadges: DrawGuessBadges,
  setup: () => {},
  customChatMsg: DrawGuessChatMsg,
  imActing: ({ room, userId }) => {
    return (room as IDrawGuessRoom).drawerId === userId
  },
}

export default DrawGuess
