interface Message {
  content: string
  created_time: string
  files: Array<File>
  level: number
  reactions: Array<number>
  user: UserInfo
  descendants: Array<Message>
  ancestor: string
  parent?: string
  _id: string
}

interface File {
  thumb: string
  url: string
  _id: string
}

interface UserInfo {
  _id: string
  username: string
}