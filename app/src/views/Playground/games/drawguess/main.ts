import { IDrawGuessRoom } from 'shared/types/games/drawguess.js'
import DrawGuessMain from './DrawguessMain.vue'
import DrawGuessBadges from './DrawguessBadges.vue'
import DrawGuessChatMsg from './DrawguessChatMsg.vue'
import { GameOptions } from '../../Game.vue'
import DrawguessGameInfo from './DrawguessGameInfo.vue'

const DrawGuess: GameOptions = {
  gameinfo: DrawguessGameInfo,
  main: DrawGuessMain,
  customBadges: DrawGuessBadges,
  setup: ({ room, userId, ws }: { room: IDrawGuessRoom; userId: string; ws: WebSocket }) => {},
  customChatMsg: DrawGuessChatMsg,
  isMeActing: ({ room, userId }: { room: IDrawGuessRoom; userId: string }) => {
    return room.drawerId === userId
  },
}

export default DrawGuess
